// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetReviewDraftStore } from "@/review/store";
import { useWorkingDiff } from "./use-working-diff";

vi.mock("@/review", async () => ({
  ...(await vi.importActual("@/review/store")),
  useInlineReviewController: () => ({}),
}));

vi.mock("@/git/use-status-query", () => ({
  useCheckoutStatusQuery: () => ({
    status: { isGit: true, isDirty: true, baseRef: "main", currentBranch: "feature" },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/git/use-diff-query", () => ({
  useCheckoutDiffQuery: () => ({
    files: [],
    payloadError: null,
    diffTooLarge: false,
    isLoading: false,
  }),
}));

const options = {
  serverId: "server-1",
  workspaceId: "workspace-1",
  cwd: "/repo",
  ignoreWhitespace: false,
  enabled: true,
};

describe("working diff comparison handoff", () => {
  beforeEach(resetReviewDraftStore);
  afterEach(cleanup);

  it("copies the chosen comparison only on explicit handoff and within the source workspace", () => {
    const { result } = renderHook(() => ({
      tree: useWorkingDiff({ ...options, modeScope: "changes_tree" }),
      diff: useWorkingDiff({ ...options, modeScope: "working_diff" }),
      other: useWorkingDiff({
        ...options,
        workspaceId: "workspace-2",
        modeScope: "working_diff",
      }),
    }));

    act(() => result.current.tree.selectBase());
    expect(result.current.tree.diffMode).toBe("base");
    expect(result.current.diff.diffMode).toBe("uncommitted");

    act(() => result.current.tree.selectDiffMode(result.current.tree.diffMode, "working_diff"));
    expect(result.current.diff.diffMode).toBe("base");
    expect(result.current.other.diffMode).toBe("uncommitted");

    act(() => result.current.tree.selectUncommitted());
    expect(result.current.diff.diffMode).toBe("base");
    act(() => result.current.tree.selectDiffMode(result.current.tree.diffMode, "working_diff"));
    expect(result.current.diff.diffMode).toBe("uncommitted");
  });
});
