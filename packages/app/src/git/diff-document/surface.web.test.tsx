/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paintWebViewport } from "./paint.web";
import { DiffSurface } from "./surface.web";
import type { DiffDocumentModel, DiffFileSection, DiffSurfaceProps } from "./types";
import { DiffDocumentWorkspaceCacheProvider } from "./workspace-cache";

vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
vi.mock("@/components/ui/overlay-scrollbar/dom-overlay-scrollbar", () => ({
  DomOverlayScrollbar: () => null,
}));
vi.mock("@/review", () => ({
  InlineReviewAddButton: () => null,
  InlineReviewThread: () => null,
}));
vi.mock("./document-file-header", () => ({
  DocumentFileHeader: ({ file }: { file: DiffFileSection }) => (
    <span data-testid={`header-stat-${file.path}`}>{file.file.additions}</span>
  ),
}));
vi.mock("./horizontal-scroll.web", () => ({ HorizontalScroll: () => null }));
vi.mock("./paint.web", () => ({ paintWebViewport: vi.fn(), paintWebHeaders: vi.fn() }));

const frames = new Map<number, FrameRequestCallback>();
const observers = new Set<ResizeObserverCallback>();
const stats = { commits: 0 };
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
let nextFrame = 0;

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("__PASEO_DIFF_REACT_STATS__", stats);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        observers.add(this.callback);
      }
      disconnect() {
        observers.delete(this.callback);
      }
    },
  );
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { load: () => Promise.resolve([]), ready: Promise.resolve() },
  });
  const context = {
    measureText: (text: string) => ({ width: text.length * 8 }),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((kind: string) =>
    kind === "2d" ? context : null) as HTMLCanvasElement["getContext"]);
});

afterEach(() => {
  cleanup();
  frames.clear();
  observers.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(paintWebViewport).mockClear();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

describe("diff surface scrolling", () => {
  it.each([false, true])(
    "retains the model while scrolling within a large file (wrapLines=%s)",
    async (wrapLines) => {
      const view = await mountSurface([largeFile("first.ts")], wrapLines);
      const scroll = view.getByTestId("git-diff-scroll");
      const initialModel = paintedModel();
      stats.commits = 0;

      for (let scrollTop = 300; scrollTop <= 15_000; scrollTop += 300) {
        scrollTo(scroll, scrollTop);
      }

      expect(stats.commits).toBeLessThanOrEqual(2);
      expect(paintedModel()).toBe(initialModel);
      expect(scroll.scrollTop).toBe(15_000);
      expect(view.container.querySelectorAll("[data-diff-header]")).toHaveLength(1);
      expect(vi.mocked(paintWebViewport).mock.calls.length).toBeGreaterThan(10);
    },
  );

  it("materializes a newly entered file and updates its interactive header", async () => {
    const view = await mountSurface([largeFile("first.ts"), largeFile("second.ts")], false);
    const initialModel = paintedModel();
    const secondFile = initialModel.files[1]!;
    expect(hasMeasuredText(initialModel, "first.ts")).toBe(true);
    expect(hasMeasuredText(initialModel, "second.ts")).toBe(false);
    expect(view.container.querySelector('[data-diff-header-path="second.ts"]')).toBeNull();

    scrollTo(view.getByTestId("git-diff-scroll"), secondFile.top + 3_600);

    expect(hasMeasuredText(paintedModel(), "second.ts")).toBe(true);
    expect(view.container.querySelector('[data-diff-header-path="second.ts"]')).not.toBeNull();
    expect(view.container.querySelector('[data-diff-header-path="first.ts"]')).toBeNull();
  });

  it.each([
    { layout: "unified" as const, wrapLines: false },
    { layout: "unified" as const, wrapLines: true },
    { layout: "split" as const, wrapLines: false },
  ])(
    "bounds updates across repeated two-file scroll cycles ($layout, wrap=$wrapLines)",
    async ({ layout, wrapLines }) => {
      const view = await mountSurface(
        [largeFile("first.ts"), largeFile("second.ts")],
        wrapLines,
        layout,
      );
      const scroll = view.getByTestId("git-diff-scroll");
      const maximumScrollTop = paintedModel().height - 600;
      stats.commits = 0;

      for (const steps of [90, 90, 90, 9, 9, 9, 9]) {
        scrollTo(scroll, 0);
        for (let step = 1; step <= steps; step += 1) {
          scrollTo(scroll, (maximumScrollTop * step) / steps);
        }
      }
      for (const top of [0, paintedModel().files[1]!.top + 3_600, 0]) scrollTo(scroll, top);

      expect(stats.commits).toBeLessThanOrEqual(30);
      expect(hasMeasuredText(paintedModel(), "first.ts")).toBe(true);
      expect(hasMeasuredText(paintedModel(), "second.ts")).toBe(true);
      expect(scroll.scrollTop).toBe(0);
      expect(view.container.querySelectorAll("[data-diff-header]")).toHaveLength(1);
    },
  );

  it("renders refreshed file metadata without storing stale section objects", async () => {
    const files = [largeFile("first.ts")];
    const view = await mountSurface(files, false);
    expect(view.getByTestId("header-stat-first.ts").textContent).toBe("1200");
    const updatedFile = { ...files[0]!, additions: 1_201 };

    view.rerender(
      <DiffDocumentWorkspaceCacheProvider>
        <DiffSurface {...surfaceProps([updatedFile], false)} />
      </DiffDocumentWorkspaceCacheProvider>,
    );
    act(flushFrames);

    expect(view.getByTestId("header-stat-first.ts").textContent).toBe("1201");
    expect(paintedModel().files[0]?.file).toBe(updatedFile);
  });

  it("keeps the next file interactive and materialized after the preceding file grows", async () => {
    const view = await mountSurface([largeFile("first.ts", 135), largeFile("second.ts")], false);
    const scroll = view.getByTestId("git-diff-scroll");
    scrollTo(scroll, 1_200);
    scrollTo(scroll, 2_400);
    expect(paintedModel().files[0]!.bottom).toBeGreaterThan(2_400);

    // New lines are after the visible source row, so its scroll anchor stays put.
    view.rerender(
      <DiffDocumentWorkspaceCacheProvider>
        <DiffSurface
          {...surfaceProps([largeFile("first.ts", 190), largeFile("second.ts")], false)}
        />
      </DiffDocumentWorkspaceCacheProvider>,
    );
    act(flushFrames);
    expect(scroll.scrollTop).toBe(2_400);
    scrollTo(scroll, 3_000);

    const second = paintedModel().files[1]!;
    expect(second.top).toBeGreaterThan(3_000);
    expect(second.top).toBeLessThan(3_600);
    expect(view.container.querySelector('[data-diff-header-path="second.ts"]')).not.toBeNull();
    expect(hasMeasuredText(paintedModel(), "second.ts")).toBe(true);
  });
});

async function mountSurface(
  files: ParsedDiffFile[],
  wrapLines: boolean,
  layout: "unified" | "split" = "unified",
) {
  const view = render(
    <DiffDocumentWorkspaceCacheProvider>
      <DiffSurface {...surfaceProps(files, wrapLines, layout)} />
    </DiffDocumentWorkspaceCacheProvider>,
  );
  await act(async () => {});
  act(flushFrames);
  act(() => {
    const entry = { contentRect: { width: 800, height: 600 } } as ResizeObserverEntry;
    for (const callback of observers) callback([entry], {} as ResizeObserver);
  });
  act(flushFrames);
  expect(paintedModel().height).toBeGreaterThan(20_000);
  return view;
}

function scrollTo(scroll: HTMLElement, top: number) {
  act(() => {
    scroll.scrollTop = top;
    scroll.dispatchEvent(new Event("scroll"));
  });
  act(flushFrames);
}

function flushFrames() {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) callback(performance.now());
}

function paintedModel(): DiffDocumentModel {
  const call = vi.mocked(paintWebViewport).mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![0].model;
}

function hasMeasuredText(model: DiffDocumentModel, path: string): boolean {
  return model.rows.some(
    (row) =>
      row.path === path &&
      row.kind === "line" &&
      row.cells.some((cell) => cell && cell.fragments.length > 0),
  );
}

function largeFile(path: string, lineCount = 1_200): ParsedDiffFile {
  return {
    path,
    isNew: true,
    isDeleted: false,
    additions: lineCount,
    deletions: 0,
    hunks: [
      {
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: lineCount,
        lines: Array.from({ length: lineCount }, (_, index) => ({
          type: "add" as const,
          content: `const value${index} = ${index};`,
        })),
      },
    ],
  };
}

function surfaceProps(
  files: ParsedDiffFile[],
  wrapLines: boolean,
  layout: "unified" | "split" = "unified",
): DiffSurfaceProps {
  return {
    files,
    mode: { kind: "commit" },
    collapsedFilePaths: new Set(),
    onToggleFile: vi.fn(),
    selectedPath: null,
    onSelectPath: vi.fn(),
    displayPreferences: {
      layout,
      wrapLines,
      codeFontSize: 12,
      monoFontFamily: "monospace",
    },
    headerTypography: { family: "sans-serif", size: 12, statSize: 12 },
    palette: {
      surface: "#000",
      headerSurface: "#111",
      border: "#222",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      addition: "green",
      deletion: "red",
      additionBackground: "#010",
      deletionBackground: "#100",
      emptyBackground: "#111",
      selection: "blue",
      headerActiveSurface: "#222",
      headerBorder: "#333",
      statusSuccess: "green",
      statusDanger: "red",
      statusWarning: "orange",
      syntax: {},
    },
  };
}
