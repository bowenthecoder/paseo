import type {
  AgentCreateConfigParent,
  AgentCreateConfigUnattendedInput,
  AgentMode,
  AgentProvider,
  ResolveAgentCreateConfigInput,
  ResolveAgentCreateConfigResult,
} from "./agent-sdk-types.js";

export interface ResolveCreateAgentModeInput {
  requestedMode: string | undefined;
  targetProvider: AgentProvider;
  parent: AgentCreateConfigParent | null;
  unattended: boolean;
  // `undefined` = target provider's modes unknown: explicit modes pass through
  // unvalidated, but cross-provider inheritance is still refused.
  // `[]` = target provider explicitly has no modes: use its default behavior.
  availableModes: string[] | undefined;
  // Target provider's own unattended mode id, if it has one. Used to bridge
  // unattended parents into unattended children across providers.
  targetUnattendedMode: string | undefined;
}

function listModes(modes: string[] | undefined): string {
  if (modes === undefined) {
    return "unknown";
  }
  return modes.length > 0 ? modes.join(", ") : "(none)";
}

function isUnattendedCreateConfigParent(parent: AgentCreateConfigParent): boolean {
  return parent.isUnattended;
}

function formatCreateConfigParentMode(parent: AgentCreateConfigParent): string {
  return parent.modeId ?? "<none>";
}

function formatCreateConfigParentSource(parent: AgentCreateConfigParent): string {
  return `caller (provider '${parent.provider}')`;
}

const UNATTENDED_MODE_ALIASES = new Set([
  "bypassApprovals",
  "bypassPermissions",
  "yolo",
  "full-access",
  "never",
]);

const PLAN_MODE_ALIASES = new Set(["plan", "readOnly", "read-only"]);

function fallbackModeForUnknownRequest(
  requestedMode: string,
  input: ResolveCreateAgentModeInput,
): string | undefined {
  const { availableModes } = input;
  if (UNATTENDED_MODE_ALIASES.has(requestedMode)) {
    if (input.targetUnattendedMode !== undefined) {
      return input.targetUnattendedMode;
    }
    // Muse CLI ACP used bypassApprovals; OpenCode ACP's working mode is `build`
    // and is not marked isUnattended (Auto Accept carries that instead).
    return availableModes?.find((mode) => mode !== "plan");
  }
  if (PLAN_MODE_ALIASES.has(requestedMode) && availableModes?.includes("plan")) {
    return "plan";
  }
  return undefined;
}

export function resolveAndValidateCreateAgentMode(
  input: ResolveCreateAgentModeInput,
): string | undefined {
  const { requestedMode, targetProvider, parent, availableModes } = input;

  if (requestedMode !== undefined) {
    if (availableModes === undefined || availableModes.includes(requestedMode)) {
      return requestedMode;
    }
    // Provider backends can change their mode catalog (Muse CLI ACP → OpenCode
    // ACP) while the app still submits a saved mode. Fall back instead of
    // failing the new chat.
    return fallbackModeForUnknownRequest(requestedMode, input);
  }

  if (!parent) {
    if (input.unattended && input.targetUnattendedMode !== undefined) {
      return input.targetUnattendedMode;
    }
    return undefined;
  }

  if (parent.provider === targetProvider) {
    return parent.modeId ?? undefined;
  }

  if (
    (input.unattended || isUnattendedCreateConfigParent(parent)) &&
    input.targetUnattendedMode !== undefined
  ) {
    return input.targetUnattendedMode;
  }

  if (availableModes?.length === 0) {
    return undefined;
  }

  throw new Error(
    `cannot inherit mode '${formatCreateConfigParentMode(parent)}' from ${formatCreateConfigParentSource(parent)} for new agent (provider '${targetProvider}'). Pass an explicit mode. Available modes for '${targetProvider}': ${listModes(availableModes)}`,
  );
}

export function resolveDefaultAgentCreateConfig(
  input: ResolveAgentCreateConfigInput,
): ResolveAgentCreateConfigResult {
  const availableModeIds = input.availableModes?.map((mode) => mode.id);
  return {
    modeId: resolveAndValidateCreateAgentMode({
      requestedMode: input.requestedMode,
      targetProvider: input.provider,
      parent: input.parent,
      unattended: input.unattended,
      availableModes: availableModeIds,
      targetUnattendedMode: input.availableModes?.find(isUnattendedMode)?.id,
    }),
    featureValues: input.featureValues,
  };
}

export function isDefaultAgentCreateConfigUnattended(
  input: AgentCreateConfigUnattendedInput,
): boolean {
  if (input.modeId === null) {
    return false;
  }
  return input.availableModes.some((mode) => mode.id === input.modeId && isUnattendedMode(mode));
}

function isUnattendedMode(mode: AgentMode): boolean {
  return mode.isUnattended === true;
}
