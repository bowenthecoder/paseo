import path from "node:path";
import type { AgentPermissionAction, AgentPermissionResponse } from "../agent-sdk-types.js";

/**
 * Grok Build asks its client to approve a plan through a vendor extension request instead of
 * a standard permission: when the model calls its `exit_plan_mode` tool, the agent sends
 * `_x.ai/exit_plan_mode` and waits for `{ outcome, feedback }`. Answering "Method not found"
 * makes Grok report a disconnected client, keep plan mode on and fail the tool call, which
 * is what the app used to show as "Tool call failed".
 */
export const PLAN_APPROVAL_EXT_METHODS: ReadonlySet<string> = new Set([
  "_x.ai/exit_plan_mode",
  "x.ai/exit_plan_mode",
]);

export interface PlanApprovalExtRequest {
  sessionId: string | null;
  toolCallId: string | null;
  planContent: string | null;
}

export type PlanApprovalOutcome = "approved" | "rejected" | "abandoned";

export interface PlanApprovalExtResponse extends Record<string, unknown> {
  outcome: PlanApprovalOutcome;
  feedback: string | null;
}

export const PLAN_APPROVAL_APPROVE_ACTION_ID = "approve";
export const PLAN_APPROVAL_REJECT_ACTION_ID = "reject";
export const PLAN_APPROVAL_ABANDON_ACTION_ID = "abandon";

/** Approve continues in build mode; Request changes keeps planning; Abandon leaves plan mode. */
export const PLAN_APPROVAL_ACTIONS: readonly AgentPermissionAction[] = [
  {
    id: PLAN_APPROVAL_REJECT_ACTION_ID,
    label: "Request changes",
    behavior: "deny",
    variant: "secondary",
  },
  {
    id: PLAN_APPROVAL_ABANDON_ACTION_ID,
    label: "Abandon plan",
    behavior: "deny",
    variant: "danger",
    intent: "dismiss",
  },
  {
    id: PLAN_APPROVAL_APPROVE_ACTION_ID,
    label: "Approve plan",
    behavior: "allow",
    variant: "primary",
    intent: "implement",
  },
];

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parsePlanApprovalExtRequest(
  params: Record<string, unknown>,
): PlanApprovalExtRequest {
  return {
    sessionId: optionalString(params.sessionId),
    toolCallId: optionalString(params.toolCallId),
    planContent: optionalString(params.planContent),
  };
}

/** The user's answer in the shape Grok expects back. A typed reply becomes the feedback. */
export function resolvePlanApprovalResponse(
  response: AgentPermissionResponse,
): PlanApprovalExtResponse {
  if (response.behavior === "allow") {
    return { outcome: "approved", feedback: null };
  }
  const feedback = response.message?.trim() || null;
  return {
    outcome:
      response.selectedActionId === PLAN_APPROVAL_ABANDON_ACTION_ID ? "abandoned" : "rejected",
    feedback,
  };
}

/**
 * Grok keeps the plan file at `~/.grok/sessions/<encoded cwd>/<session id>/plan.md`; the
 * extension request carries no content when the model wrote the file instead of passing it.
 */
export function grokPlanFilePath(homeDir: string, cwd: string, sessionId: string): string {
  return path.join(homeDir, ".grok", "sessions", encodeURIComponent(cwd), sessionId, "plan.md");
}

/**
 * The human name of an ACP tool call whose `kind` is missing or "other". Grok titles its
 * calls "Search tools: \"…\"", "List `dir`", "Plan: Exit"; the part before the argument is
 * the name, so the chat can say "Search tools" instead of "Other".
 */
export function toolNameFromACPTitle(title: string): string {
  const trimmed = title.trim();
  const match = /^([^:`("]+?)\s*(?::|`|\(|")/.exec(trimmed);
  const head = (match?.[1] ?? trimmed).trim();
  return head.length > 0 ? head : trimmed;
}
