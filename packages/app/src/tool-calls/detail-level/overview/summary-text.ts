import type { OverviewCategoryCount, OverviewSummary } from "./model";

export type OverviewTranslate = (key: string, options?: Record<string, unknown>) => string;

function plural(translate: OverviewTranslate, key: string, count: number): string {
  return translate(`${key}.${count === 1 ? "one" : "other"}`, { count });
}

function withFailures(translate: OverviewTranslate, text: string, count: OverviewCategoryCount) {
  return count.failed > 0
    ? `${text} ${translate("toolCallGroup.failedSuffix", { count: count.failed })}`
    : text;
}

/**
 * The one line a collapsed tool group shows, in the Claude Code app's manner:
 * "Ran 4 commands (2 failed), read config.ts". Categories keep their order, failures stay
 * inside their category, and a lone read names its file.
 */
export function buildOverviewSummaryText(
  summary: OverviewSummary,
  translate: OverviewTranslate,
): string {
  const parts: string[] = [];
  if (summary.edits.total > 0) {
    const files = Math.max(summary.editedFileCount, summary.edits.total - summary.edits.failed, 1);
    parts.push(
      withFailures(translate, plural(translate, "toolCallGroup.editedFiles", files), summary.edits),
    );
  }
  if (summary.creates.total > 0) {
    const files = Math.max(
      summary.createdFileCount,
      summary.creates.total - summary.creates.failed,
      1,
    );
    parts.push(
      withFailures(
        translate,
        plural(translate, "toolCallGroup.createdFiles", files),
        summary.creates,
      ),
    );
  }
  if (summary.commands.total > 0) {
    parts.push(
      withFailures(
        translate,
        plural(translate, "toolCallGroup.commands", summary.commands.total),
        summary.commands,
      ),
    );
  }
  if (summary.reads.total > 0) {
    const singleName = summary.readFileNames.length === 1 ? summary.readFileNames[0] : undefined;
    const text =
      singleName && summary.reads.total === 1
        ? translate("toolCallGroup.readFile", { name: singleName })
        : plural(translate, "toolCallGroup.readFiles", Math.max(summary.readFileCount, 1));
    parts.push(withFailures(translate, text, summary.reads));
  }
  if (summary.searches.total > 0) {
    parts.push(
      withFailures(
        translate,
        plural(translate, "toolCallGroup.searches", summary.searches.total),
        summary.searches,
      ),
    );
  }
  if (summary.others.total > 0) {
    parts.push(
      withFailures(
        translate,
        plural(translate, "toolCallGroup.otherTools", summary.others.total),
        summary.others,
      ),
    );
  }
  if (summary.paseoCalls.total > 0) {
    parts.push(
      withFailures(
        translate,
        plural(translate, "toolCallGroup.paseoCalls", summary.paseoCalls.total),
        summary.paseoCalls,
      ),
    );
  }
  if (summary.canceledToolCount > 0) {
    parts.push(plural(translate, "toolCallGroup.canceledTools", summary.canceledToolCount));
  }
  if (summary.runningToolCount > 0) {
    parts.push(plural(translate, "toolCallGroup.runningTools", summary.runningToolCount));
  }
  if (parts.length === 0 && summary.failedToolCount > 0) {
    parts.push(plural(translate, "toolCallGroup.failedTools", summary.failedToolCount));
  }
  const joined = parts.join(translate("toolCallGroup.separator"));
  const first = joined[0];
  return first ? `${first.toLocaleUpperCase()}${joined.slice(1)}` : joined;
}

/** "+44 -100" beside the summary when the edits carried line counts; nothing otherwise. */
export function buildOverviewDiffText(summary: OverviewSummary): string | undefined {
  if (summary.additions === 0 && summary.deletions === 0) return undefined;
  return `+${summary.additions} -${summary.deletions}`;
}
