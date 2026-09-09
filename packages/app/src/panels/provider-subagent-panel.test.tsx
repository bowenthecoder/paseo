// @vitest-environment jsdom

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentStreamViewProps } from "@/agent-stream/view";
import { useSessionStore } from "@/stores/session-store";
import { providerSubagentKey, useProviderSubagentStore } from "@/subagents/provider-store";
import { useSubagentsForParent } from "@/subagents/select";
import { providerSubagentPanelRegistration } from "./provider-subagent-panel";

const SERVER_ID = "tasks-recovery-host";
const PARENT_ID = "parent";
const CHILD_ID = "native-child";
const connection = vi.hoisted(() => ({ connected: true }));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeIsConnected: () => connection.connected,
}));
vi.mock("@/panels/pane-context", () => ({
  usePaneContext: () => ({
    serverId: SERVER_ID,
    target: { kind: "provider_subagent", parentAgentId: PARENT_ID, subagentId: CHILD_ID },
  }),
}));
vi.mock("@/panels/agent-pane-context", () => ({
  createAgentPaneContext: () => ({ openFileInWorkspace: vi.fn() }),
}));
vi.mock("@/agent-stream/view", () => ({
  AgentStreamView: ({ isAuthoritativeHistoryReady, streamItems }: AgentStreamViewProps) => (
    <div data-testid="task-transcript" data-ready={String(isAuthoritativeHistoryReady)}>
      {streamItems.map((item) => (item.kind === "assistant_message" ? item.text : "")).join("")}
    </div>
  ),
}));
vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const Panel = providerSubagentPanelRegistration.component;
type TimelineResponse = Awaited<ReturnType<DaemonClient["fetchProviderSubagentTimeline"]>>;

function timeline(text: string): TimelineResponse {
  return {
    requestId: "timeline",
    parentAgentId: PARENT_ID,
    subagentId: CHILD_ID,
    provider: "codex",
    direction: "tail",
    epoch: "epoch",
    reset: false,
    staleCursor: false,
    gap: false,
    window: { minSeq: 1, maxSeq: 1, nextSeq: 2 },
    hasOlder: false,
    hasNewer: false,
    rows: [
      { seq: 1, timestamp: "2026-09-08T12:00:00.000Z", item: { type: "assistant_message", text } },
    ],
    error: null,
  };
}

function initializeClient() {
  const client = {
    listProviderSubagents: vi.fn<DaemonClient["listProviderSubagents"]>().mockResolvedValue({
      requestId: "list",
      parentAgentId: PARENT_ID,
      subagents: [
        {
          id: CHILD_ID,
          parentAgentId: PARENT_ID,
          provider: "codex",
          title: "Review",
          description: "Review the changes",
          status: "completed",
          toolCallId: null,
          createdAt: "2026-09-08T12:00:00.000Z",
          updatedAt: "2026-09-08T12:00:00.000Z",
        },
      ],
      error: null,
    }),
    fetchProviderSubagentTimeline: vi.fn<DaemonClient["fetchProviderSubagentTimeline"]>(),
  };
  useSessionStore.getState().initializeSession(SERVER_ID, client as unknown as DaemonClient);
  useSessionStore.getState().updateSessionServerInfo(SERVER_ID, {
    serverId: SERVER_ID,
    hostname: "Tasks host",
    version: "0.7.2",
    features: { providerSubagents: true },
  });
  return client;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  connection.connected = true;
});

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession(SERVER_ID);
  useProviderSubagentStore.setState({
    descriptors: new Map(),
    timelines: new Map(),
    hiddenFromTrack: new Set(),
  });
});

describe("provider task transcript recovery", () => {
  it("rediscovers finished tasks after a failed list request and same-client reconnect", async () => {
    const client = initializeClient();
    client.listProviderSubagents.mockRejectedValueOnce(new Error("Connection lost"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const view = renderHook(
      () => useSubagentsForParent({ serverId: SERVER_ID, parentAgentId: PARENT_ID }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(client.listProviderSubagents).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(view.result.current).toEqual([]);

    connection.connected = false;
    view.rerender();
    connection.connected = true;
    view.rerender();
    await waitFor(() => expect(view.result.current).toHaveLength(1));
    expect(view.result.current[0]).toMatchObject({
      kind: "provider",
      id: CHILD_ID,
      status: "completed",
    });
    expect(client.listProviderSubagents).toHaveBeenCalledTimes(2);
  });

  it("shows a retryable failure instead of a ready empty transcript, then loads the retry", async () => {
    const client = initializeClient();
    client.fetchProviderSubagentTimeline
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(timeline("Recovered task output"));
    const view = render(<Panel />);
    expect(view.getByTestId("task-transcript").getAttribute("data-ready")).toBe("false");
    const retry = await view.findByTestId("provider-subagent-load-retry");
    expect(view.getByTestId("task-transcript").getAttribute("data-ready")).toBe("false");
    fireEvent.click(retry);
    await view.findByText("Recovered task output");
    expect(view.queryByTestId("provider-subagent-load-error")).toBeNull();
    expect(view.getByTestId("task-transcript").getAttribute("data-ready")).toBe("true");
    expect(client.fetchProviderSubagentTimeline).toHaveBeenCalledTimes(2);
  });

  it("reloads missed task history when the same daemon client reconnects", async () => {
    const client = initializeClient();
    client.fetchProviderSubagentTimeline.mockRejectedValueOnce(new Error("Connection lost"));
    const view = render(<Panel />);
    await waitFor(() => expect(client.fetchProviderSubagentTimeline).toHaveBeenCalledTimes(1));
    await act(async () => {});
    connection.connected = false;
    view.rerender(<Panel />);
    client.fetchProviderSubagentTimeline.mockResolvedValueOnce(
      timeline("Finished while disconnected"),
    );
    connection.connected = true;
    view.rerender(<Panel />);
    await view.findByText("Finished while disconnected");
    expect(client.fetchProviderSubagentTimeline).toHaveBeenCalledTimes(2);
    expect(
      useProviderSubagentStore
        .getState()
        .timelines.has(providerSubagentKey(SERVER_ID, PARENT_ID, CHILD_ID)),
    ).toBe(true);
  });

  it("keeps cached task output visible when a reconnect refresh fails", async () => {
    const client = initializeClient();
    client.fetchProviderSubagentTimeline
      .mockResolvedValueOnce(timeline("Existing output"))
      .mockRejectedValueOnce(new Error("Temporary server error"))
      .mockResolvedValueOnce(timeline("Fresh output"));
    const view = render(<Panel />);
    await view.findByText("Existing output");

    connection.connected = false;
    view.rerender(<Panel />);
    connection.connected = true;
    view.rerender(<Panel />);
    const retry = await view.findByTestId("provider-subagent-load-retry");
    expect(view.getByText("Existing output")).toBeTruthy();
    expect(view.getByTestId("task-transcript").getAttribute("data-ready")).toBe("true");

    fireEvent.click(retry);
    await view.findByText("Fresh output");
    expect(view.queryByText("Existing output")).toBeNull();
    expect(view.queryByTestId("provider-subagent-load-error")).toBeNull();
  });

  it("waits for the host when opened offline and loads automatically on reconnect", async () => {
    const client = initializeClient();
    client.fetchProviderSubagentTimeline.mockResolvedValue(timeline("Task from the host"));
    connection.connected = false;
    const view = render(<Panel />);
    expect(view.getByText("subagents.connectToLoad")).toBeTruthy();
    expect(client.fetchProviderSubagentTimeline).not.toHaveBeenCalled();
    expect(client.listProviderSubagents).not.toHaveBeenCalled();

    connection.connected = true;
    view.rerender(<Panel />);
    await view.findByText("Task from the host");
    expect(view.queryByTestId("provider-subagent-load-error")).toBeNull();
    expect(client.listProviderSubagents).toHaveBeenCalledTimes(1);
  });

  it("ignores a pending response from an unmounted pane after the task is reopened", async () => {
    const client = initializeClient();
    let resolveOldRequest!: (response: TimelineResponse) => void;
    const oldRequest = new Promise<TimelineResponse>((resolve) => {
      resolveOldRequest = resolve;
    });
    client.fetchProviderSubagentTimeline
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce(timeline("Current task output"));
    const oldView = render(<Panel />);
    await waitFor(() => expect(client.fetchProviderSubagentTimeline).toHaveBeenCalledTimes(1));
    oldView.unmount();

    const view = render(<Panel />);
    await view.findByText("Current task output");
    await act(async () => resolveOldRequest(timeline("Obsolete output")));
    expect(view.getByText("Current task output")).toBeTruthy();
    expect(view.queryByText("Obsolete output")).toBeNull();
  });
});
