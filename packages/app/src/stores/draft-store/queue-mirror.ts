import { userAttachmentsOnly } from "@/attachments/workspace-attachment-utils";
import { useSessionStore, type QueuedSessionMessage } from "@/stores/session-store";
import type { QueuedDraftMessage } from "./state";

/**
 * Keeps the per-agent composer queue on disk.
 *
 * A held message only earns its name if it is still there after a restart, and the queue lives in
 * the session store, which is memory-only. Rather than teach every writer to save, this mirrors
 * the session store's queue into the persisted draft store and hydrates it back when a session
 * appears. Both directions run through one subscription, so a new queue writer cannot forget.
 */
export interface QueuePersistence {
  readServerQueues: (serverId: string) => Record<string, QueuedDraftMessage[]>;
  writeServerQueues: (serverId: string, queues: Record<string, QueuedDraftMessage[]>) => void;
}

/**
 * Workspace attachments (review snapshots, browser elements, chat history) are dropped, exactly as
 * they are for drafts: they are captured from a live workspace and have no persisted schema.
 */
export function toPersistedQueuedMessages(
  queue: readonly QueuedSessionMessage[],
): QueuedDraftMessage[] {
  return queue.map((item) => ({
    id: item.id,
    text: item.text,
    attachments: userAttachmentsOnly(item.attachments),
    ...(item.hold ? { hold: true } : {}),
  }));
}

export function collectServerQueues(
  queuedMessages: ReadonlyMap<string, QueuedSessionMessage[]>,
): Record<string, QueuedDraftMessage[]> {
  const queues: Record<string, QueuedDraftMessage[]> = {};
  for (const [agentId, queue] of queuedMessages) {
    if (queue.length === 0) continue;
    queues[agentId] = toPersistedQueuedMessages(queue);
  }
  return queues;
}

/**
 * Fills in the agents that have nothing queued in memory. An agent whose live queue is already
 * populated wins: it is the newer of the two, and overwriting it would resurrect sent messages.
 * Returns null when there is nothing to hydrate, so callers can skip the write.
 */
export function mergeHydratedQueues(
  live: ReadonlyMap<string, QueuedSessionMessage[]>,
  persisted: Record<string, QueuedDraftMessage[]>,
): Map<string, QueuedSessionMessage[]> | null {
  const pending = Object.entries(persisted).filter(
    ([agentId, queue]) => queue.length > 0 && !live.get(agentId)?.length,
  );
  if (pending.length === 0) return null;
  const next = new Map(live);
  for (const [agentId, queue] of pending) {
    next.set(agentId, [...queue]);
  }
  return next;
}

function hydrateServer(persistence: QueuePersistence, serverId: string): void {
  const session = useSessionStore.getState().sessions[serverId];
  if (!session) return;
  const merged = mergeHydratedQueues(
    session.queuedMessages,
    persistence.readServerQueues(serverId),
  );
  if (!merged) return;
  useSessionStore.getState().setQueuedMessages(serverId, merged);
}

/** Hydrates every session that already exists — the draft store rehydrates asynchronously and can
 * finish after the first host connects. */
export function hydrateQueuedMessagesIntoSessions(persistence: QueuePersistence): void {
  for (const serverId of Object.keys(useSessionStore.getState().sessions)) {
    hydrateServer(persistence, serverId);
  }
}

export function startQueuedMessageMirror(persistence: QueuePersistence): () => void {
  return useSessionStore.subscribe((state, previous) => {
    for (const [serverId, session] of Object.entries(state.sessions)) {
      const before = previous.sessions[serverId];
      if (!before) {
        // A session store write inside a session store notification would hand the remaining
        // listeners a stale snapshot, so the hydrating write waits for the current one to finish.
        queueMicrotask(() => hydrateServer(persistence, serverId));
        continue;
      }
      if (before.queuedMessages === session.queuedMessages) continue;
      persistence.writeServerQueues(serverId, collectServerQueues(session.queuedMessages));
    }
  });
}
