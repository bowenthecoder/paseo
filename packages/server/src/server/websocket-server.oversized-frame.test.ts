import { describe, expect, it, vi } from "vitest";
import type { Server as HTTPServer } from "http";
import type pino from "pino";
import type { AgentManager } from "./agent/agent-manager.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import type { DownloadTokenStore } from "./file-download/token-store.js";
import type { DaemonConfigStore } from "./daemon-config-store.js";
import type { ScheduleService } from "./schedule/service.js";
import type { CheckoutDiffManager } from "./checkout-diff-manager.js";
import type { WSOutboundMessage } from "./messages.js";
import { asInternals, createStub } from "./test-utils/class-mocks.js";
import { createProviderSnapshotManagerStub } from "./test-utils/session-stubs.js";
import type { WorkspaceAutoName } from "./workspace-auto-name.js";
import { MAX_PHYSICAL_FRAME_BYTES } from "./websocket/physical-socket.js";
import {
  MutableDaemonConfigSchema,
  SessionOutboundMessageSchema,
} from "@getpaseo/protocol/messages";
import { MAX_TIMELINE_PAGE_BYTES } from "./agent/timeline-page-budget.js";

const wsModuleMock = vi.hoisted(() => {
  class MockWebSocketServer {
    on() {
      return this;
    }

    close() {
      // no-op
    }
  }

  return { MockWebSocketServer };
});

vi.mock("ws", () => ({
  WebSocketServer: wsModuleMock.MockWebSocketServer,
}));

vi.mock("./session.js", () => ({
  Session: function Session() {
    return {};
  },
}));

import { VoiceAssistantWebSocketServer } from "./websocket-server.js";

interface WebSocketServerInternals {
  sendToClient(ws: unknown, message: WSOutboundMessage): void;
  rejectOversizedOutboundMessage(
    sockets: unknown[],
    message: WSOutboundMessage,
    payloadBytes: number,
  ): void;
  runtimeMetrics: { snapshot(): { counters: { oversizedFrameDropped: number } } };
}

function createLogger() {
  const logger = {
    child: vi.fn(() => logger),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

function createServer() {
  const logger = createLogger();
  const server = new VoiceAssistantWebSocketServer(
    createStub<HTTPServer>({}),
    createStub<pino.Logger>(logger),
    "srv-test",
    createStub<AgentManager>({
      subscribe: vi.fn(() => () => {}),
      setAgentAttentionCallback: vi.fn(),
      getMetricsSnapshot: vi.fn(() => ({
        total: 0,
        byLifecycle: {},
        withActiveForegroundTurn: 0,
        timelineStats: { totalItems: 0, maxItemsPerAgent: 0 },
      })),
    }),
    createStub<AgentStorage>({}),
    createStub<DownloadTokenStore>({}),
    "/tmp/paseo-test",
    createStub<DaemonConfigStore>({
      get: () =>
        MutableDaemonConfigSchema.parse({ mcp: { injectIntoAgents: false }, providers: {} }),
      onApply: vi.fn(() => () => {}),
      onChange: vi.fn(() => () => {}),
    }),
    null,
    { allowedOrigins: new Set() },
    createStub<WorkspaceAutoName>({
      scheduleForWorktree: () => {},
      scheduleForDirectory: () => {},
    }),
    undefined,
    undefined,
    undefined,
    undefined,
    "1.2.3-test",
    undefined,
    undefined,
    undefined,
    createStub<ScheduleService>({}),
    createStub<CheckoutDiffManager>({
      subscribe: vi.fn(),
      scheduleRefreshForCwd: vi.fn(),
      getMetrics: vi.fn(() => ({
        checkoutDiffTargetCount: 0,
        checkoutDiffSubscriptionCount: 0,
        checkoutDiffWatcherCount: 0,
        checkoutDiffFallbackRefreshTargetCount: 0,
      })),
      dispose: vi.fn(),
    }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createProviderSnapshotManagerStub().manager,
  );
  return { server, logger };
}

function createOpenSocket() {
  return {
    readyState: 1,
    bufferedAmount: 0,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
  };
}

describe("oversized outbound frames", () => {
  it("drops the frame, answers the request with rpc_error, and keeps the socket open", () => {
    const { server, logger } = createServer();
    const ws = createOpenSocket();
    const internals = asInternals<WebSocketServerInternals>(server);

    internals.sendToClient(ws, {
      type: "session",
      message: {
        type: "fetch_agent_timeline_response",
        payload: {
          requestId: "req-huge",
          agentId: "agent-huge",
          entries: [{ text: "x".repeat(MAX_PHYSICAL_FRAME_BYTES + 1) }],
        },
      },
    } as unknown as WSOutboundMessage);

    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.terminate).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(ws.send.mock.calls[0]?.[0]));
    expect(sent).toEqual({
      type: "session",
      message: {
        type: "rpc_error",
        payload: {
          requestId: "req-huge",
          requestType: "fetch_agent_timeline_response",
          error: expect.stringContaining("Response too large to deliver"),
          code: "response_too_large",
        },
      },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionMessageType: "fetch_agent_timeline_response",
        requestId: "req-huge",
        agentId: "agent-huge",
        maxFrameBytes: MAX_PHYSICAL_FRAME_BYTES,
      }),
      "ws_frame_oversized_dropped",
    );
  });

  it("delivers a marked excerpt for an oversized live timeline event without losing its position", () => {
    const { server, logger } = createServer();
    const ws = createOpenSocket();
    const internals = asInternals<WebSocketServerInternals>(server);

    const message: WSOutboundMessage = {
      type: "session",
      message: {
        type: "agent_stream",
        payload: {
          agentId: "agent-huge",
          timestamp: "2026-09-09T00:00:00.000Z",
          seq: 7,
          epoch: "epoch-1",
          event: {
            type: "timeline",
            provider: "codex",
            turnId: "turn-1",
            item: {
              type: "assistant_message",
              messageId: "message-1",
              text: "x".repeat(MAX_PHYSICAL_FRAME_BYTES + 1),
            },
          },
        },
      },
    };
    internals.sendToClient(ws, message);

    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledTimes(1);
    const serialized = String(ws.send.mock.calls[0]?.[0]);
    expect(Buffer.byteLength(serialized)).toBeLessThan(MAX_TIMELINE_PAGE_BYTES);
    const sent = JSON.parse(serialized);
    expect(SessionOutboundMessageSchema.safeParse(sent.message).success).toBe(true);
    expect(sent.message.payload).toMatchObject({
      agentId: "agent-huge",
      seq: 7,
      epoch: "epoch-1",
      event: {
        type: "timeline",
        provider: "codex",
        turnId: "turn-1",
        item: { type: "assistant_message", messageId: "message-1" },
      },
    });
    expect(sent.message.payload.event.item.text).toContain("[truncated by daemon:");
    expect(message.message.payload.event.item.text).toHaveLength(MAX_PHYSICAL_FRAME_BYTES + 1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ sessionMessageType: "agent_stream", requestId: null }),
      "ws_frame_oversized_dropped",
    );
  });

  it("requests authoritative recovery when oversized timeline identity cannot be shortened", () => {
    const { server } = createServer();
    const ws = createOpenSocket();
    const internals = asInternals<WebSocketServerInternals>(server);
    internals.sendToClient(ws, {
      type: "session",
      message: {
        type: "agent_stream",
        payload: {
          agentId: "agent-huge",
          timestamp: "2026-09-09T00:00:00.000Z",
          seq: 7,
          epoch: "epoch-1",
          event: {
            type: "timeline",
            provider: "codex",
            item: {
              type: "assistant_message",
              messageId: "m".repeat(MAX_PHYSICAL_FRAME_BYTES + 1),
              text: "done",
            },
          },
        },
      },
    });
    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(ws.send.mock.calls[0]?.[0]));
    expect(sent).toEqual({
      type: "session",
      message: {
        type: "agent.timeline.replacement",
        payload: { agentId: "agent-huge", epoch: "epoch-1" },
      },
    });
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it("does not recurse or log an unbounded request id when the error response itself cannot fit", () => {
    const { server, logger } = createServer();
    const ws = createOpenSocket();
    const internals = asInternals<WebSocketServerInternals>(server);
    const originalReject = internals.rejectOversizedOutboundMessage.bind(internals);
    let rejected = 0;
    vi.spyOn(internals, "rejectOversizedOutboundMessage").mockImplementation((...args) => {
      // Stop the old implementation after its first recursive attempt, rather
      // than allocating oversized errors until the test process runs out of memory.
      if (++rejected > 1) throw new Error("Recursive oversized error response");
      originalReject(...args);
    });
    const requestId = "r".repeat(MAX_PHYSICAL_FRAME_BYTES + 1);
    expect(() =>
      internals.sendToClient(ws, {
        type: "session",
        message: {
          type: "rpc_error",
          payload: { requestId, requestType: "fetch_agent_timeline_request", error: "failed" },
        },
      }),
    ).not.toThrow();
    expect(rejected).toBe(1);
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.terminate).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls).length).toBeLessThan(2_048);
    // An impossible correlation id must not poison the shared socket for others.
    internals.sendToClient(ws, {
      type: "session",
      message: { type: "rpc_error", payload: { requestId: "req-next", error: "next request" } },
    });
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it("still closes a socket whose client stopped draining", () => {
    const { server } = createServer();
    const ws = { ...createOpenSocket(), bufferedAmount: MAX_PHYSICAL_FRAME_BYTES };
    const internals = asInternals<WebSocketServerInternals>(server);

    internals.sendToClient(ws, {
      type: "session",
      message: { type: "agent_stream", payload: { agentId: "agent-1", event: { text: "small" } } },
    } as unknown as WSOutboundMessage);

    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.terminate).toHaveBeenCalled();
  });
});
