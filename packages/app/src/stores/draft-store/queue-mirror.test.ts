import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ComposerAttachment } from "@/attachments/types";
import { useSessionStore, type QueuedSessionMessage } from "@/stores/session-store";
import {
  collectServerQueues,
  hydrateQueuedMessagesIntoSessions,
  mergeHydratedQueues,
  startQueuedMessageMirror,
  toPersistedQueuedMessages,
  type QueuePersistence,
} from "./queue-mirror";
import type { QueuedDraftMessage } from "./state";

const SERVER_ID = "srv_queue_mirror";

function imageAttachment(id: string): ComposerAttachment {
  return {
    kind: "image",
    metadata: {
      id,
      mimeType: "image/png",
      storageType: "web-indexeddb",
      storageKey: `key-${id}`,
      createdAt: 1,
    },
  };
}

const REVIEW_ATTACHMENT: ComposerAttachment = {
  kind: "review",
  reviewDraftKey: "review:key",
  commentCount: 0,
  attachment: {
    type: "review",
    mimeType: "application/paseo-review",
    cwd: "/repo",
    mode: "uncommitted",
    baseRef: null,
    comments: [],
  },
};

function createFakePersistence(
  initial: Record<string, Record<string, QueuedDraftMessage[]>> = {},
): QueuePersistence & { state: Record<string, Record<string, QueuedDraftMessage[]>> } {
  const fake = {
    state: { ...initial },
    readServerQueues: (serverId: string) => fake.state[serverId] ?? {},
    writeServerQueues: (serverId: string, queues: Record<string, QueuedDraftMessage[]>) => {
      if (Object.keys(queues).length === 0) {
        delete fake.state[serverId];
        return;
      }
      fake.state[serverId] = queues;
    },
  };
  return fake;
}

describe("toPersistedQueuedMessages", () => {
  it("keeps text, user attachments and the hold flag", () => {
    const queue: QueuedSessionMessage[] = [
      { id: "held", text: "wait", attachments: [imageAttachment("img-1")], hold: true },
      { id: "auto", text: "drain", attachments: [] },
    ];

    expect(toPersistedQueuedMessages(queue)).toEqual([
      { id: "held", text: "wait", attachments: [imageAttachment("img-1")], hold: true },
      { id: "auto", text: "drain", attachments: [] },
    ]);
  });

  it("drops workspace attachments, which have no persisted shape", () => {
    const queue: QueuedSessionMessage[] = [
      { id: "held", text: "review this", attachments: [REVIEW_ATTACHMENT, imageAttachment("i")] },
    ];

    expect(toPersistedQueuedMessages(queue)[0]?.attachments).toEqual([imageAttachment("i")]);
  });
});

describe("collectServerQueues", () => {
  it("skips agents whose queue is empty", () => {
    const queues = collectServerQueues(
      new Map([
        ["agent", [{ id: "a", text: "queued", attachments: [] }]],
        ["drained", []],
      ]),
    );

    expect(Object.keys(queues)).toEqual(["agent"]);
  });
});

describe("mergeHydratedQueues", () => {
  it("returns null when there is nothing persisted to restore", () => {
    expect(mergeHydratedQueues(new Map(), {})).toBeNull();
    expect(mergeHydratedQueues(new Map(), { agent: [] })).toBeNull();
  });

  it("fills empty agents and leaves a live queue alone", () => {
    const live = new Map<string, QueuedSessionMessage[]>([
      ["live", [{ id: "fresh", text: "typed just now", attachments: [] }]],
      ["empty", []],
    ]);

    const merged = mergeHydratedQueues(live, {
      live: [{ id: "stale", text: "from disk", attachments: [] }],
      empty: [{ id: "restored", text: "held before reload", attachments: [], hold: true }],
    });

    expect(merged?.get("live")).toEqual([{ id: "fresh", text: "typed just now", attachments: [] }]);
    expect(merged?.get("empty")).toEqual([
      { id: "restored", text: "held before reload", attachments: [], hold: true },
    ]);
  });
});

describe("queued message mirror", () => {
  let stopMirror: (() => void) | null = null;

  beforeEach(() => {
    useSessionStore.getState().initializeSession(SERVER_ID, null as unknown as DaemonClient);
  });

  afterEach(() => {
    stopMirror?.();
    stopMirror = null;
    useSessionStore.getState().clearSession(SERVER_ID);
  });

  it("writes every queue change through to persistence", () => {
    const persistence = createFakePersistence();
    stopMirror = startQueuedMessageMirror(persistence);

    useSessionStore
      .getState()
      .setQueuedMessages(
        SERVER_ID,
        new Map([["agent", [{ id: "held", text: "hold me", attachments: [], hold: true }]]]),
      );

    expect(persistence.state[SERVER_ID]?.agent).toEqual([
      { id: "held", text: "hold me", attachments: [], hold: true },
    ]);

    useSessionStore.getState().setQueuedMessages(SERVER_ID, new Map([["agent", []]]));
    expect(persistence.state[SERVER_ID]).toBeUndefined();
  });

  it("restores a persisted queue into a session that appears later", async () => {
    const persistence = createFakePersistence({
      srv_late: { agent: [{ id: "held", text: "survived", attachments: [], hold: true }] },
    });
    stopMirror = startQueuedMessageMirror(persistence);

    useSessionStore.getState().initializeSession("srv_late", null as unknown as DaemonClient);
    await Promise.resolve();

    expect(useSessionStore.getState().sessions.srv_late?.queuedMessages.get("agent")).toEqual([
      { id: "held", text: "survived", attachments: [], hold: true },
    ]);
    useSessionStore.getState().clearSession("srv_late");
  });

  it("restores into sessions that already existed when persistence finished loading", () => {
    const persistence = createFakePersistence({
      [SERVER_ID]: { agent: [{ id: "held", text: "late rehydrate", attachments: [], hold: true }] },
    });

    hydrateQueuedMessagesIntoSessions(persistence);

    expect(useSessionStore.getState().sessions[SERVER_ID]?.queuedMessages.get("agent")).toEqual([
      { id: "held", text: "late rehydrate", attachments: [], hold: true },
    ]);
  });

  it("leaves a session alone when the disk copy is empty", () => {
    const persistence = createFakePersistence();
    useSessionStore
      .getState()
      .setQueuedMessages(
        SERVER_ID,
        new Map([["agent", [{ id: "live", text: "typed now", attachments: [] }]]]),
      );

    hydrateQueuedMessagesIntoSessions(persistence);

    expect(useSessionStore.getState().sessions[SERVER_ID]?.queuedMessages.get("agent")).toEqual([
      { id: "live", text: "typed now", attachments: [] },
    ]);
  });
});
