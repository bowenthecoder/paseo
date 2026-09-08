import { randomUUID } from "node:crypto";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { z } from "zod";
import type { AgentStreamEvent, AgentTimelineItem } from "../agent-sdk-types.js";
import type { ProviderSubagentInputEvent } from "../provider-subagents/store.js";
import {
  contentBlockToText,
  mapToolSnapshotToTimeline,
  mergeToolSnapshot,
  type ACPNotificationAdapter,
  type ACPNotificationContext,
  type ACPToolSnapshot,
} from "./acp-agent.js";

const tokenCount = z.number().finite().nonnegative();
const GrokUpdateSchema = z.object({
  sessionId: z.string(),
  update: z.discriminatedUnion("sessionUpdate", [
    z.object({
      sessionUpdate: z.literal("subagent_spawned"),
      subagent_id: z.string(),
      parent_session_id: z.string(),
      child_session_id: z.string(),
      subagent_type: z.string(),
      description: z.string(),
      model: z.string().optional(),
    }),
    z.object({
      sessionUpdate: z.literal("subagent_progress"),
      subagent_id: z.string(),
      child_session_id: z.string(),
      tokens_used: tokenCount.optional(),
    }),
    z.object({
      sessionUpdate: z.literal("subagent_finished"),
      subagent_id: z.string(),
      child_session_id: z.string(),
      status: z.enum(["completed", "failed", "cancelled", "canceled"]),
      tokens_used: tokenCount.optional(),
      output: z.string().optional(),
      error: z.string().optional(),
    }),
  ]),
  _meta: z.object({ eventId: z.string().optional() }).optional(),
});

const GrokContextSchema = z.object({ totalTokens: tokenCount.optional() });
const GrokModelSchema = z.object({ totalContextTokens: z.number().positive().optional() });

interface ChildState {
  id: string;
  model?: string;
  type: string;
  tokens?: number;
  tools: Map<string, ACPToolSnapshot>;
  assistantMessageId?: string;
  hasAssistantText: boolean;
  pendingUserText: string;
}

/** Grok Build announces native children before streaming their separate ACP session channels. */
export class GrokSubagentAdapter implements ACPNotificationAdapter {
  private readonly children = new Map<string, ChildState>();
  private readonly observedEvents = new Set<string>();
  private lastRootTokens: number | undefined;

  extensionNotification(
    method: string,
    params: Record<string, unknown>,
    context: ACPNotificationContext,
  ): AgentStreamEvent[] {
    if (method !== "_x.ai/session_notification" || !context.sessionId) return [];
    const parsed = GrokUpdateSchema.safeParse(params);
    if (!parsed.success) return [];
    const { sessionId, update, _meta } = parsed.data;
    if (sessionId !== context.sessionId && !this.children.has(sessionId)) return [];
    if (_meta?.eventId) {
      if (this.observedEvents.has(_meta.eventId)) return [];
      this.observedEvents.add(_meta.eventId);
    }
    if (update.sessionUpdate === "subagent_spawned") {
      if (update.parent_session_id !== sessionId) return [];
      const child: ChildState = {
        id: update.subagent_id,
        type: update.subagent_type,
        model: update.model,
        tools: new Map(),
        hasAssistantText: false,
        pendingUserText: "",
      };
      this.children.set(update.child_session_id, child);
      return [
        this.wrap({
          type: "upsert",
          id: child.id,
          title: update.description || update.subagent_type,
          description: update.description,
          status: "running",
          subtitle: this.subtitle(child),
        }),
      ];
    }
    const child = this.children.get(update.child_session_id);
    if (!child || child.id !== update.subagent_id) return [];
    if (update.tokens_used !== undefined) child.tokens = update.tokens_used;
    const events = [this.wrap({ type: "upsert", id: child.id, subtitle: this.subtitle(child) })];
    if (update.sessionUpdate === "subagent_finished") {
      events.push(...this.flushUserMessage(child));
      if (update.output && !child.hasAssistantText) {
        events.push(this.timeline(child, { type: "assistant_message", text: update.output }));
        child.hasAssistantText = true;
      }
      if (update.error)
        events.push(this.timeline(child, { type: "assistant_message", text: update.error }));
      events.push(
        this.wrap({
          type: "upsert",
          id: child.id,
          status: update.status === "cancelled" ? "canceled" : update.status,
        }),
      );
    }
    return events;
  }

  sessionUpdate(params: SessionNotification, context: ACPNotificationContext): AgentStreamEvent[] {
    if (params.sessionId === context.sessionId) return this.rootUsage(params, context);
    const child = this.children.get(params.sessionId);
    if (!child) return [];
    const update = params.update;
    if (update.sessionUpdate === "user_message_chunk") {
      child.pendingUserText += contentBlockToText(update.content);
      child.assistantMessageId = undefined;
      return [];
    }
    const events = this.flushUserMessage(child);
    switch (update.sessionUpdate) {
      case "agent_message_chunk": {
        const text = contentBlockToText(update.content);
        if (text) {
          child.hasAssistantText = true;
          child.assistantMessageId = update.messageId ?? child.assistantMessageId ?? randomUUID();
          events.push(
            this.timeline(child, {
              type: "assistant_message",
              text,
              messageId: child.assistantMessageId,
            }),
          );
        }
        break;
      }
      case "agent_thought_chunk": {
        const text = contentBlockToText(update.content);
        if (text) events.push(this.timeline(child, { type: "reasoning", text }));
        break;
      }
      case "tool_call":
      case "tool_call_update": {
        child.assistantMessageId = undefined;
        const snapshot = mergeToolSnapshot(
          update.toolCallId,
          update,
          child.tools.get(update.toolCallId),
        );
        child.tools.set(update.toolCallId, snapshot);
        events.push(this.timeline(child, mapToolSnapshotToTimeline(snapshot)));
        break;
      }
      case "usage_update":
        child.tokens = update.used;
        events.push(this.wrap({ type: "upsert", id: child.id, subtitle: this.subtitle(child) }));
        break;
    }
    return events;
  }

  private rootUsage(
    params: SessionNotification,
    context: ACPNotificationContext,
  ): AgentStreamEvent[] {
    const parsed = GrokContextSchema.safeParse(params._meta);
    const tokens = parsed.success ? parsed.data.totalTokens : undefined;
    if (tokens === undefined || tokens === this.lastRootTokens) return [];
    this.lastRootTokens = tokens;
    const model = GrokModelSchema.safeParse(context.modelMetadata);
    return [
      {
        type: "usage_updated",
        provider: "acp",
        usage: {
          contextWindowUsedTokens: tokens,
          ...(model.success && model.data.totalContextTokens
            ? { contextWindowMaxTokens: model.data.totalContextTokens }
            : {}),
        },
      },
    ];
  }

  private subtitle(child: ChildState): string {
    const tokens =
      child.tokens === undefined
        ? undefined
        : `${child.tokens < 1000 ? Math.round(child.tokens) : `${Math.round(child.tokens / 100) / 10}k`} tokens`;
    return [child.type, child.model, tokens].filter(Boolean).join(" · ");
  }

  private flushUserMessage(child: ChildState): AgentStreamEvent[] {
    if (!child.pendingUserText) return [];
    const text = child.pendingUserText;
    child.pendingUserText = "";
    return [this.timeline(child, { type: "user_message", text })];
  }

  private timeline(child: ChildState, item: AgentTimelineItem): AgentStreamEvent {
    return this.wrap({ type: "timeline", id: child.id, item });
  }

  private wrap(event: ProviderSubagentInputEvent): AgentStreamEvent {
    // GenericACPAgentClient's registered provider wrapper replaces the transport family id.
    return { type: "provider_subagent", provider: "acp", event };
  }
}
