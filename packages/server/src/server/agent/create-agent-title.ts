import { MAX_EXPLICIT_AGENT_TITLE_CHARS } from "@getpaseo/protocol/agent-title-limits";
import type { FirstAgentContext } from "@getpaseo/protocol/messages";
import type { AgentPromptInput } from "./agent-sdk-types.js";

const MAX_INITIAL_AGENT_TITLE_CHARS = Math.min(48, MAX_EXPLICIT_AGENT_TITLE_CHARS);

function deriveInitialAgentTitle(prompt: string): string | null {
  const firstContentLine = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstContentLine) {
    return null;
  }
  const normalized = firstContentLine
    .replace(
      /^(?:(?:please|can you|could you|would you|help me(?: to)?|i (?:want|need|would like) you to)\s+)+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  const words = normalized.split(" ").slice(0, 6);
  while (words.length > 1 && words.join(" ").length > MAX_INITIAL_AGENT_TITLE_CHARS) words.pop();
  const clamped = words.join(" ").slice(0, MAX_INITIAL_AGENT_TITLE_CHARS).trim();
  return clamped.length > 0 ? clamped : null;
}

export function resolveCreateAgentTitles(options: {
  configTitle?: string | null;
  initialPrompt?: string | null;
}): { explicitTitle: string | null; provisionalTitle: string | null } {
  const explicitTitle =
    typeof options.configTitle === "string" && options.configTitle.trim().length > 0
      ? options.configTitle.trim()
      : null;
  const trimmedPrompt = options.initialPrompt?.trim();
  const provisionalTitle =
    explicitTitle ?? (trimmedPrompt ? deriveInitialAgentTitle(trimmedPrompt) : null);

  return {
    explicitTitle,
    provisionalTitle,
  };
}

export function resolveFirstAgentPromptTitle(firstAgentContext?: FirstAgentContext): string | null {
  return (
    resolveCreateAgentTitles({
      initialPrompt: firstAgentContext?.prompt,
    }).provisionalTitle ?? null
  );
}

/** Use accepted task content and attachment metadata; imported history is not a new task. */
export function resolveAcceptedTitlePrompt(prompt: AgentPromptInput): string {
  if (typeof prompt === "string") return prompt.trim();
  const text = prompt
    .flatMap((block) =>
      block.type === "text" && !("contextKind" in block && block.contextKind === "chat_history")
        ? [block.text.trim()]
        : [],
    )
    .filter(Boolean)
    .join("\n");
  if (text) return text;
  return prompt
    .flatMap((block) => {
      switch (block.type) {
        case "uploaded_file":
          return [`Review ${block.fileName}`];
        case "image":
          return ["Review attached image"];
        case "forge_issue":
        case "github_issue":
        case "forge_change_request":
        case "github_pr":
          return [block.title];
        case "review":
          return ["Review attached changes"];
        default:
          return [];
      }
    })
    .join("\n")
    .trim();
}
