import { expect, test } from "vitest";
import { GrokSubagentAdapter } from "./grok-subagents.js";
import { ProviderSubagentStore } from "../provider-subagents/store.js";
import type { AgentStreamEvent } from "../agent-sdk-types.js";

const context = { sessionId: "parent", modelMetadata: { totalContextTokens: 500000 } };
const method = "_x.ai/session_notification";
function spawn(adapter: GrokSubagentAdapter): AgentStreamEvent[] {
  return adapter.extensionNotification(
    method,
    {
      sessionId: "parent",
      update: {
        sessionUpdate: "subagent_spawned",
        subagent_id: "child",
        parent_session_id: "parent",
        child_session_id: "child",
        subagent_type: "general-purpose",
        description: "Verify sentinel",
        model: "grok-4.6",
      },
      _meta: { eventId: "parent-1" },
    },
    context,
  );
}
function apply(store: ProviderSubagentStore, events: AgentStreamEvent[]): void {
  for (const event of events) {
    if (event.type === "provider_subagent") store.apply("paseo-parent", "grok", event.event);
  }
}

test("Grok native child lifecycle, transcript and reported tokens reach the shared store", () => {
  const adapter = new GrokSubagentAdapter();
  const store = new ProviderSubagentStore();
  apply(store, spawn(adapter));
  expect(store.list("paseo-parent")).toMatchObject([
    {
      id: "child",
      title: "Verify sentinel",
      status: "running",
      subtitle: "general-purpose · grok-4.6",
    },
  ]);
  apply(
    store,
    adapter.sessionUpdate(
      {
        sessionId: "child",
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: "Reply SENTINEL" },
        },
      },
      context,
    ),
  );
  apply(
    store,
    adapter.sessionUpdate(
      {
        sessionId: "child",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "SENTINEL" },
          messageId: "answer",
        },
      },
      context,
    ),
  );
  apply(
    store,
    adapter.extensionNotification(
      method,
      {
        sessionId: "parent",
        update: {
          sessionUpdate: "subagent_progress",
          subagent_id: "child",
          child_session_id: "child",
          tokens_used: 5529,
        },
      },
      context,
    ),
  );
  expect(store.get("paseo-parent", "child")).toMatchObject({
    status: "running",
    subtitle: "general-purpose · grok-4.6 · 5.5k tokens",
  });
  apply(
    store,
    adapter.extensionNotification(
      method,
      {
        sessionId: "parent",
        update: {
          sessionUpdate: "subagent_finished",
          subagent_id: "child",
          child_session_id: "child",
          status: "completed",
          tokens_used: 14001,
          output: "SENTINEL",
        },
      },
      context,
    ),
  );
  expect(store.get("paseo-parent", "child")).toMatchObject({
    status: "completed",
    subtitle: "general-purpose · grok-4.6 · 14k tokens",
  });
  expect(store.fetchTimeline("paseo-parent", "child").rows.map((row) => row.item)).toEqual([
    { type: "user_message", text: "Reply SENTINEL" },
    { type: "assistant_message", text: "SENTINEL", messageId: "answer" },
  ]);
});

test("Grok preserves completion on late progress and does not invent unreported tokens", () => {
  const adapter = new GrokSubagentAdapter();
  const store = new ProviderSubagentStore();
  apply(store, spawn(adapter));
  apply(
    store,
    adapter.extensionNotification(
      method,
      {
        sessionId: "parent",
        update: {
          sessionUpdate: "subagent_finished",
          subagent_id: "child",
          child_session_id: "child",
          status: "cancelled",
        },
      },
      context,
    ),
  );
  apply(
    store,
    adapter.extensionNotification(
      method,
      {
        sessionId: "parent",
        update: {
          sessionUpdate: "subagent_progress",
          subagent_id: "child",
          child_session_id: "child",
        },
      },
      context,
    ),
  );
  expect(store.get("paseo-parent", "child")).toMatchObject({
    status: "canceled",
    subtitle: "general-purpose · grok-4.6",
  });
});

test("Grok ignores unrelated sessions and duplicate replay announcements", () => {
  const adapter = new GrokSubagentAdapter();
  expect(
    adapter.sessionUpdate(
      {
        sessionId: "stranger",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Private" },
        },
      },
      context,
    ),
  ).toEqual([]);
  spawn(adapter);
  expect(spawn(adapter)).toEqual([]);
  expect(
    adapter.extensionNotification(
      method,
      {
        sessionId: "stranger",
        update: {
          sessionUpdate: "subagent_finished",
          subagent_id: "child",
          child_session_id: "child",
          status: "failed",
        },
      },
      context,
    ),
  ).toEqual([]);
});

test("Grok projects background-child output when its stream was not forwarded", () => {
  const adapter = new GrokSubagentAdapter();
  spawn(adapter);
  expect(
    adapter.extensionNotification(
      method,
      {
        sessionId: "parent",
        update: {
          sessionUpdate: "subagent_finished",
          subagent_id: "child",
          child_session_id: "child",
          status: "completed",
          output: "Background result",
        },
      },
      context,
    ),
  ).toContainEqual({
    type: "provider_subagent",
    provider: "acp",
    event: {
      type: "timeline",
      id: "child",
      item: { type: "assistant_message", text: "Background result" },
    },
  });
});

test("Grok root context updates stay separate from child usage and repeated text chunks", () => {
  const adapter = new GrokSubagentAdapter();
  const notification = {
    sessionId: "parent",
    update: {
      sessionUpdate: "agent_message_chunk" as const,
      content: { type: "text" as const, text: "Hello" },
    },
    _meta: { totalTokens: 22043 },
  };
  expect(adapter.sessionUpdate(notification, context)).toEqual([
    {
      type: "usage_updated",
      provider: "acp",
      usage: { contextWindowUsedTokens: 22043, contextWindowMaxTokens: 500000 },
    },
  ]);
  expect(adapter.sessionUpdate(notification, context)).toEqual([]);
});
