import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedComposerMessage } from "./actions";
import { renderQueueTrack, type QueueTrackLabels } from "./queue-track";

const LABELS: QueueTrackLabels = {
  edit: "Edit queued message",
  sendNow: "Send queued message now",
  remove: "Remove queued message",
  held: "Held",
  sendAll: "Send all",
};

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

interface Handlers {
  edited: string[];
  sentNow: string[];
  removed: string[];
  sendAllCalls: number;
}

function mountTrack(queuedMessages: QueuedComposerMessage[]): {
  container: HTMLDivElement;
  handlers: Handlers;
} {
  const handlers: Handlers = { edited: [], sentNow: [], removed: [], sendAllCalls: 0 };
  const container = mount(
    renderQueueTrack({
      queuedMessages,
      handleEditQueuedMessage: (id) => handlers.edited.push(id),
      handleSendQueuedNow: (id) => handlers.sentNow.push(id),
      handleRemoveQueuedMessage: (id) => handlers.removed.push(id),
      handleSendAllHeldMessages: () => {
        handlers.sendAllCalls += 1;
      },
      labels: LABELS,
    }),
  );
  return { container, handlers };
}

function buttons(container: HTMLDivElement, label: string): HTMLElement[] {
  return [...container.querySelectorAll(`[aria-label="${label}"]`)].filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
}

function click(element: Element): void {
  act(() => {
    (element as HTMLElement).click();
  });
}

describe("composer queue track", () => {
  it("renders nothing for an empty queue", () => {
    const { container } = mountTrack([]);
    expect(container.querySelector('[data-testid="composer-queue-track"]')).toBeNull();
  });

  it("gives every row edit, remove and send now", () => {
    const { container, handlers } = mountTrack([
      { id: "msg-1", text: "first", attachments: [] },
      { id: "msg-2", text: "second", attachments: [], hold: true },
    ]);

    expect(container.querySelectorAll('[data-testid="composer-queued-message"]')).toHaveLength(2);

    click(buttons(container, LABELS.edit)[1]);
    click(buttons(container, LABELS.remove)[0]);
    click(buttons(container, LABELS.sendNow)[1]);

    expect(handlers.edited).toEqual(["msg-2"]);
    expect(handlers.removed).toEqual(["msg-1"]);
    expect(handlers.sentNow).toEqual(["msg-2"]);
  });

  it("badges held rows only, so an automatically queued row stays unmarked", () => {
    const { container } = mountTrack([
      { id: "msg-1", text: "auto", attachments: [] },
      { id: "msg-2", text: "held", attachments: [], hold: true },
    ]);

    const rows = [...container.querySelectorAll('[data-testid="composer-queued-message"]')];
    expect(rows[0]?.querySelector('[data-testid="composer-queued-message-held"]')).toBeNull();
    expect(
      rows[1]?.querySelector('[data-testid="composer-queued-message-held"]')?.textContent,
    ).toBe(LABELS.held);
  });

  it("offers Send all only while something is held", () => {
    const autoOnly = mountTrack([{ id: "msg-1", text: "auto", attachments: [] }]);
    expect(autoOnly.container.querySelector('[data-testid="composer-queue-send-all"]')).toBeNull();

    const withHeld = mountTrack([
      { id: "msg-1", text: "auto", attachments: [] },
      { id: "msg-2", text: "held", attachments: [], hold: true },
    ]);
    const sendAll = withHeld.container.querySelector('[data-testid="composer-queue-send-all"]');
    expect(sendAll).not.toBeNull();

    click(sendAll as Element);
    expect(withHeld.handlers.sendAllCalls).toBe(1);
  });
});
