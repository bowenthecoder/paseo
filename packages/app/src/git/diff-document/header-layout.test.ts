import { describe, expect, it } from "vitest";
import {
  diffInteractionWindowTop,
  retainDiffInteractionWindow,
  resolveVisibleFileSections,
} from "./header-layout";
import type { DiffFileSection } from "./types";

describe("diff header viewport", () => {
  it("keeps a many-file document bounded by the viewport", () => {
    const files = Array.from({ length: 2_000 }, (_, index) => collapsedFile(index));

    const window = resolveVisibleFileSections({
      files,
      scrollTop: 30_000,
      viewportHeight: 600,
      overscan: 600,
    });

    expect(window.files.length).toBeLessThanOrEqual(61);
    expect(window.sticky?.file.fileIndex).toBe(1_000);
    expect(window.sticky?.y).toBe(0);
  });

  it("pins an expanded file whose original header is outside overscan", () => {
    const files = [expandedFile(0, 4_000), collapsedFile(1, 4_030)];

    const window = resolveVisibleFileSections({
      files,
      scrollTop: 2_000,
      viewportHeight: 600,
      overscan: 600,
    });

    expect(window.files.map((file) => file.path)).toEqual(["file-0.ts"]);
    expect(window.sticky).toEqual({ file: files[0], y: 0 });
  });

  it("pushes the pinned header out one pixel at a time", () => {
    const files = [expandedFile(0, 100), collapsedFile(1, 130)];

    expect(
      resolveVisibleFileSections({ files, scrollTop: 129, viewportHeight: 100, overscan: 0 }).sticky
        ?.y,
    ).toBe(-29);
    expect(
      resolveVisibleFileSections({ files, scrollTop: 130, viewportHeight: 100, overscan: 0 }).sticky
        ?.y,
    ).toBe(0);
  });
});

describe("diff interaction window", () => {
  it("retains one shell window across two viewport heights", () => {
    expect(diffInteractionWindowTop(0, 500)).toBe(0);
    expect(diffInteractionWindowTop(999, 500)).toBe(0);
    expect(diffInteractionWindowTop(1_000, 500)).toBe(1_000);
  });

  it("retains the materialization window across scroll buckets inside one large file", () => {
    const files = [section(0, 0, 40_000, false), section(1, 40_000, 60_000, false)];
    const current = { top: 0, paths: [files[0]!.path] };

    expect(
      retainDiffInteractionWindow(current, { files, scrollTop: 20_000, viewportHeight: 600 }),
    ).toBe(current);
  });

  it("advances materialization and shells together when another file enters overscan", () => {
    const files = [section(0, 0, 4_000, false), section(1, 4_000, 40_000, false)];
    const current = { top: 0, paths: [files[0]!.path] };

    const next = retainDiffInteractionWindow(current, {
      files,
      scrollTop: 2_400,
      viewportHeight: 600,
    });

    expect(next).toEqual({ top: 2_400, paths: files.map((file) => file.path) });
  });

  it("retains the window when materialization refreshes section objects", () => {
    const files = [collapsedFile(0), collapsedFile(1), collapsedFile(2)];
    const current = { top: 0, paths: files.map((file) => file.path) };
    const updatedFiles = [files[0]!, { ...files[1]!, contentWidth: 800 }, files[2]!];

    const next = retainDiffInteractionWindow(current, {
      files: updatedFiles,
      scrollTop: 0,
      viewportHeight: 600,
    });

    expect(next).toBe(current);
  });

  it("refreshes a replaced middle file even when the first and last paths are unchanged", () => {
    const files = [collapsedFile(0), collapsedFile(1), collapsedFile(2)];
    const current = { top: 0, paths: files.map((file) => file.path) };
    const updatedFiles = [files[0]!, { ...files[1]!, path: "replacement.ts" }, files[2]!];

    const next = retainDiffInteractionWindow(current, {
      files: updatedFiles,
      scrollTop: 0,
      viewportHeight: 600,
    });

    expect(next).not.toBe(current);
    expect(next.paths).toEqual(["file-0.ts", "replacement.ts", "file-2.ts"]);
  });

  it("keeps many-file shells bounded when moving to a distant part of the document", () => {
    const files = Array.from({ length: 2_000 }, (_, index) => collapsedFile(index));
    const initial = retainDiffInteractionWindow(
      { top: 0, paths: [] },
      { files, scrollTop: 0, viewportHeight: 600 },
    );

    const next = retainDiffInteractionWindow(initial, {
      files,
      scrollTop: 30_000,
      viewportHeight: 600,
    });

    expect(next.top).toBe(30_000);
    expect(next.paths).toHaveLength(100);
    expect(next.paths[0]).toBe("file-960.ts");
    expect(next.paths.at(-1)).toBe("file-1059.ts");
  });
});

function collapsedFile(fileIndex: number, top = fileIndex * 30): DiffFileSection {
  return section(fileIndex, top, top + 30, true);
}

function expandedFile(fileIndex: number, bodyHeight: number): DiffFileSection {
  const top = fileIndex === 0 ? 0 : bodyHeight - 30;
  return section(fileIndex, top, top + 30 + bodyHeight, false);
}

function section(
  fileIndex: number,
  top: number,
  bottom: number,
  isCollapsed: boolean,
): DiffFileSection {
  const path = `file-${fileIndex}.ts`;
  return {
    file: {
      path,
      oldPath: undefined,
      additions: 1,
      deletions: 1,
      isNew: false,
      isDeleted: false,
      hunks: [],
    },
    fileIndex,
    path,
    top,
    headerHeight: 30,
    bodyTop: top + 30,
    bodyHeight: bottom - top - 30,
    bottom,
    gutterWidth: 30,
    contentWidth: 300,
    rowStart: 0,
    rowEnd: 0,
    isCollapsed,
  };
}
