import {
  isPlanningAgentMode,
  PLAN_MODE_FEATURE_ID,
  resolveNonPlanningModeId,
} from "@/agent-controls/policy";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceDraftTabSetup } from "@/workspace-tabs/model";

export type ClientSlashCommandKind =
  | "archive-agent"
  | "replace-agent-with-draft"
  | "toggle-plan-mode";
export type ClientSlashCommandExecution = "immediate" | "insert";

export interface ClientSlashCommand {
  name: string;
  aliases: readonly string[];
  description: string;
  descriptionKey:
    | "composer.clientCommands.archiveAgent"
    | "composer.clientCommands.freshDraft"
    | "composer.clientCommands.planMode";
  argumentHint: string;
  kind: ClientSlashCommandKind;
  execution: ClientSlashCommandExecution;
}

export const CLIENT_SLASH_COMMANDS: readonly ClientSlashCommand[] = [
  {
    name: "exit",
    aliases: ["quit", "q"],
    description: "Archive the current agent",
    descriptionKey: "composer.clientCommands.archiveAgent",
    argumentHint: "",
    kind: "archive-agent",
    execution: "immediate",
  },
  {
    name: "clear",
    aliases: ["new", "reset"],
    description: "Archive this agent and start a fresh draft",
    descriptionKey: "composer.clientCommands.freshDraft",
    argumentHint: "",
    kind: "replace-agent-with-draft",
    execution: "immediate",
  },
  {
    name: "plan",
    aliases: ["planmode"],
    description: "Switch plan mode on or off for this agent",
    descriptionKey: "composer.clientCommands.planMode",
    argumentHint: "",
    kind: "toggle-plan-mode",
    execution: "immediate",
  },
];

const COMMAND_BY_NAME = new Map<string, ClientSlashCommand>();
for (const command of CLIENT_SLASH_COMMANDS) {
  COMMAND_BY_NAME.set(command.name, command);
  for (const alias of command.aliases) {
    COMMAND_BY_NAME.set(alias, command);
  }
}

export function resolveClientSlashCommand(input: {
  text: string;
  hasAttachments: boolean;
}): ClientSlashCommand | null {
  if (input.hasAttachments) {
    return null;
  }

  const trimmed = input.text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const commandName = trimmed.slice(1);
  if (!commandName || /\s/.test(commandName)) {
    return null;
  }

  return COMMAND_BY_NAME.get(commandName) ?? null;
}

export function buildDraftAgentSetup(agent: Agent): WorkspaceDraftTabSetup {
  const featureValues: Record<string, unknown> = {};
  for (const feature of agent.features ?? []) {
    featureValues[feature.id] = feature.value;
  }

  return {
    provider: agent.provider,
    cwd: agent.cwd,
    modeId: agent.currentModeId ?? agent.runtimeInfo?.modeId ?? null,
    model: agent.model ?? agent.runtimeInfo?.model ?? null,
    thinkingOptionId: agent.thinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? null,
    featureValues,
  };
}

export type PlanModeToggle =
  | { kind: "feature"; featureId: string; value: boolean }
  | { kind: "mode"; modeId: string; entering: boolean }
  | null;

/**
 * How /plan flips this agent: Codex exposes plan mode as a feature toggle, Claude Code and
 * OpenCode as a planning mode, and some providers have neither.
 */
export function resolvePlanModeToggle(agent: Agent): PlanModeToggle {
  const planFeature = agent.features?.find(
    (feature) => feature.id === PLAN_MODE_FEATURE_ID && feature.type === "toggle",
  );
  if (planFeature && planFeature.type === "toggle") {
    return { kind: "feature", featureId: planFeature.id, value: !planFeature.value };
  }
  const modes = agent.availableModes ?? [];
  const planMode = modes.find(isPlanningAgentMode);
  if (!planMode) return null;
  if (agent.currentModeId === planMode.id) {
    const offModeId = resolveNonPlanningModeId(modes, null);
    return offModeId ? { kind: "mode", modeId: offModeId, entering: false } : null;
  }
  return { kind: "mode", modeId: planMode.id, entering: true };
}
