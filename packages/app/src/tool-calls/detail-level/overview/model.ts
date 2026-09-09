import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { describeToolCall, type ToolCallDescriptor, type ToolCallRun } from "../grouping";

const DIRECT_PASEO_TOOL_PREFIX = "paseo_";
const DIRECT_SEARCH_TOOL_SUFFIX_PATTERN = /(?:^|[_.:/])(?:web_search|llm_context)$/;

export type OverviewCategory =
  | "edit"
  | "create"
  | "command"
  | "read"
  | "search"
  | "agent"
  | "other"
  | "paseo";

export interface OverviewCategoryCount {
  /** Every call in the category, including the ones that failed. */
  total: number;
  failed: number;
}

export interface OverviewSummary {
  edits: OverviewCategoryCount;
  creates: OverviewCategoryCount;
  commands: OverviewCategoryCount;
  reads: OverviewCategoryCount;
  searches: OverviewCategoryCount;
  /** Subagent launches (Claude's Task/Agent, Codex's spawn_agent, OpenCode's task). */
  agents: OverviewCategoryCount;
  others: OverviewCategoryCount;
  paseoCalls: OverviewCategoryCount;
  /** Unique files behind `edits`, `creates` and `reads`; names let one read say which file. */
  editedFileCount: number;
  createdFileCount: number;
  readFileCount: number;
  readFileNames: string[];
  commandCount: number;
  searchCount: number;
  agentCount: number;
  otherToolCount: number;
  paseoCallCount: number;
  failedToolCount: number;
  canceledToolCount: number;
  runningToolCount: number;
  /** Line counts from the edits' diffs, when the provider reported them. */
  additions: number;
  deletions: number;
}

export interface OverviewToolCallGroup {
  mode: "overview";
  run: ToolCallRun;
  summary: OverviewSummary;
  isLoading: boolean;
}

function isPaseoCall(name: string, normalizedName: string): boolean {
  return isPaseoToolName(name) || normalizedName.startsWith(DIRECT_PASEO_TOOL_PREFIX);
}

function isSearchCall(name: string): boolean {
  return DIRECT_SEARCH_TOOL_SUFFIX_PATTERN.test(name);
}

const NAME_CATEGORY_RULES: ReadonlyArray<[RegExp, OverviewCategory]> = [
  [/^(?:search|grep|glob|find|websearch|web_search|rg|ripgrep)\b/, "search"],
  [/^(?:read|cat|view|list|ls|list_dir|tree|open)\b/, "read"],
  [/^(?:write|create|new_file)\b/, "create"],
  [/^(?:edit|update|patch|replace|apply_patch|str_replace)\b/, "edit"],
  [/^(?:bash|shell|run|exec|execute|command|terminal|zsh|sh)\b/, "command"],
  [/^(?:task|agent|workflow|spawn_agent|collaboration\.spawn_agent|subagent|sub_agent)\b/, "agent"],
];

/** Tools that only report a title (Grok's "Search tools", "List") still land in a category. */
function categoryFromName(normalizedName: string): OverviewCategory {
  const compact = normalizedName.replace(/[\s_-]+/g, "_");
  for (const [pattern, category] of NAME_CATEGORY_RULES) {
    if (pattern.test(compact) || pattern.test(normalizedName)) return category;
  }
  return "other";
}

function categoryOf(descriptor: ToolCallDescriptor, normalizedName: string): OverviewCategory {
  if (isPaseoCall(descriptor.name, normalizedName)) return "paseo";
  switch (descriptor.detail.type) {
    case "edit":
      return "edit";
    case "write":
      return "create";
    case "shell":
      return "command";
    case "read":
      return "read";
    case "search":
      return "search";
    case "sub_agent":
      return "agent";
    default:
      break;
  }
  if (isSearchCall(normalizedName)) return "search";
  if (descriptor.detail.type === "plain_text" || descriptor.detail.type === "unknown") {
    return categoryFromName(normalizedName);
  }
  return "other";
}

function fileName(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? filePath;
}

function countLines(text: string | undefined): number {
  if (!text) return 0;
  return text.split("\n").filter((line) => line.length > 0).length;
}

function diffCounts(detail: ToolCallDetail): { additions: number; deletions: number } {
  if (detail.type === "edit") {
    if (detail.unifiedDiff) {
      let additions = 0;
      let deletions = 0;
      for (const line of detail.unifiedDiff.split("\n")) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;
        if (line.startsWith("+")) additions += 1;
        else if (line.startsWith("-")) deletions += 1;
      }
      return { additions, deletions };
    }
    return { additions: countLines(detail.newString), deletions: countLines(detail.oldString) };
  }
  if (detail.type === "write") {
    return { additions: countLines(detail.content), deletions: 0 };
  }
  return { additions: 0, deletions: 0 };
}

function emptyCount(): OverviewCategoryCount {
  return { total: 0, failed: 0 };
}

export function buildOverviewGroup(run: ToolCallRun): OverviewToolCallGroup {
  const counts: Record<OverviewCategory, OverviewCategoryCount> = {
    edit: emptyCount(),
    create: emptyCount(),
    command: emptyCount(),
    read: emptyCount(),
    search: emptyCount(),
    agent: emptyCount(),
    other: emptyCount(),
    paseo: emptyCount(),
  };
  const editedFiles = new Set<string>();
  const createdFiles = new Set<string>();
  const readFiles = new Map<string, string>();
  let isLoading = false;
  let failedToolCount = 0;
  let canceledToolCount = 0;
  let runningToolCount = 0;
  let additions = 0;
  let deletions = 0;

  for (const call of run.calls) {
    const descriptor = describeToolCall(call);
    const normalizedName = descriptor.name.trim().toLowerCase();
    if (descriptor.status === "running" || descriptor.status === "executing") {
      isLoading = true;
      runningToolCount += 1;
      continue;
    }
    if (descriptor.status === "canceled") {
      canceledToolCount += 1;
      continue;
    }
    const category = categoryOf(descriptor, normalizedName);
    const count = counts[category];
    count.total += 1;
    if (descriptor.status === "failed") {
      count.failed += 1;
      failedToolCount += 1;
      continue;
    }
    const detail = descriptor.detail;
    if (detail.type === "edit") editedFiles.add(detail.filePath);
    else if (detail.type === "write") createdFiles.add(detail.filePath);
    else if (detail.type === "read") readFiles.set(detail.filePath, fileName(detail.filePath));
    const diff = diffCounts(detail);
    additions += diff.additions;
    deletions += diff.deletions;
  }

  const summary: OverviewSummary = {
    edits: counts.edit,
    creates: counts.create,
    commands: counts.command,
    reads: counts.read,
    searches: counts.search,
    agents: counts.agent,
    others: counts.other,
    paseoCalls: counts.paseo,
    editedFileCount: editedFiles.size,
    createdFileCount: createdFiles.size,
    readFileCount: readFiles.size,
    readFileNames: [...readFiles.values()],
    commandCount: counts.command.total,
    searchCount: counts.search.total,
    agentCount: counts.agent.total,
    otherToolCount: counts.other.total,
    paseoCallCount: counts.paseo.total,
    failedToolCount,
    canceledToolCount,
    runningToolCount,
    additions,
    deletions,
  };
  return {
    mode: "overview",
    run,
    isLoading,
    summary,
  };
}
