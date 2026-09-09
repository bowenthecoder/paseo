import type { DiffFileSection } from "./types";

export interface VisibleDiffFileSections {
  files: DiffFileSection[];
  sticky: { file: DiffFileSection; y: number } | null;
}

export interface DiffInteractionWindow {
  top: number;
  paths: string[];
}

export function retainDiffInteractionWindow(
  current: DiffInteractionWindow,
  input: {
    files: readonly DiffFileSection[];
    scrollTop: number;
    viewportHeight: number;
  },
): DiffInteractionWindow {
  const top = diffInteractionWindowTop(input.scrollTop, input.viewportHeight);
  const files = resolveVisibleFileSections({
    files: input.files,
    scrollTop: top,
    viewportHeight: input.viewportHeight,
    overscan: input.viewportHeight * 2,
  }).files;
  // A materialized file already contains all of its text. Keep only its identity
  // here: rebuilding the model refreshes section objects without changing this
  // window. The renderer obtains current header geometry from that live model.
  if (
    current.paths.length === files.length &&
    current.paths.every((path, index) => path === files[index]?.path)
  ) {
    // A live edit can move these same files outside the saved bucket. Keep that
    // bucket only while it still materializes and renders the current file set.
    const retainedFiles =
      top === current.top
        ? files
        : resolveVisibleFileSections({
            files: input.files,
            scrollTop: current.top,
            viewportHeight: input.viewportHeight,
            overscan: input.viewportHeight * 2,
          }).files;
    if (
      retainedFiles.length === files.length &&
      retainedFiles.every((file, index) => file.path === files[index]?.path)
    )
      return current;
  }
  return { top, paths: files.map((file) => file.path) };
}

export function diffInteractionWindowTop(scrollTop: number, viewportHeight: number): number {
  "worklet";
  const bucketHeight = Math.max(1, viewportHeight * 2);
  return Math.floor(Math.max(0, scrollTop) / bucketHeight) * bucketHeight;
}

export function diffMaterializationWindow(
  windowTop: number,
  viewportHeight: number,
): { top: number; height: number } {
  return {
    top: Math.max(0, windowTop - viewportHeight * 2),
    height: viewportHeight * 5,
  };
}

export function diffHeaderViewportKey(input: {
  files: readonly DiffFileSection[];
  scrollTop: number;
  viewportHeight: number;
  activePath: string | null;
}): string {
  const window = resolveVisibleFileSections({ ...input, overscan: 0 });
  const headers = window.files
    .filter((file) => file !== window.sticky?.file)
    .map((file) => `${file.fileIndex}:${file.top - input.scrollTop}`);
  if (window.sticky) headers.push(`${window.sticky.file.fileIndex}:${window.sticky.y}`);
  return `${input.activePath ?? ""}|${headers.join(",")}`;
}

export function resolveVisibleFileSections(input: {
  files: readonly DiffFileSection[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
}): VisibleDiffFileSections {
  if (input.files.length === 0 || input.viewportHeight <= 0) {
    return { files: [], sticky: null };
  }
  const visibleTop = Math.max(0, input.scrollTop - input.overscan);
  const visibleBottom = input.scrollTop + input.viewportHeight + input.overscan;
  const start = firstFileWhoseEndExceeds(input.files, visibleTop);
  const files: DiffFileSection[] = [];
  for (let index = start; index < input.files.length; index += 1) {
    const file = input.files[index];
    if (!file || file.top >= visibleBottom) break;
    files.push(file);
  }
  const stickyFile = input.files[firstFileWhoseEndExceeds(input.files, input.scrollTop)] ?? null;
  const sticky = stickyFile
    ? {
        file: stickyFile,
        y: Math.min(0, stickyFile.bottom - input.scrollTop - stickyFile.headerHeight),
      }
    : null;
  return { files, sticky };
}

function firstFileWhoseEndExceeds(files: readonly DiffFileSection[], offset: number): number {
  let low = 0;
  let high = files.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const file = files[middle];
    if (file && file.bottom <= offset) low = middle + 1;
    else high = middle;
  }
  return low;
}
