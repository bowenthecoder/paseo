import type { SplitNode } from "@/stores/workspace-layout-store";
import { resolveWorkspaceContentMinimum } from "@/components/desktop-sidebar-layout";
import { splitNodeContainsPane } from "@/components/split-container-focus";

interface VisibleGroupInput {
  children: SplitNode[];
  sizes: number[];
  maximizedPaneId: string | null;
}

/** Presentation sizes leave the persisted proportions intact when the window shrinks. */
export function resolveVisibleGroupFlex({
  children,
  sizes,
  maximizedPaneId,
  direction,
  containerSize,
}: VisibleGroupInput & {
  direction: "horizontal" | "vertical" | null;
  containerSize: number;
}): number[] {
  const visible = children.map(
    (child) => !isSplitNodeHiddenForPresentation(child, maximizedPaneId),
  );
  const visibleSizes = children.map((_, index) => (visible[index] ? (sizes[index] ?? 1) : 0));
  const visibleTotal = visibleSizes.reduce((total, size) => total + size, 0);
  if (visibleTotal <= 0) return children.map(() => 0);

  const flex = visibleSizes.map((size) => size / visibleTotal);
  if (direction !== "horizontal" || containerSize <= 0) return flex;

  const minimumWidths = children.map((child, index) =>
    visible[index] ? resolveWorkspaceContentMinimum(child) : 0,
  );
  // Each rendered handle occupies one pixel between adjacent visible children.
  const handles = visible.filter((shown, index) => shown && visible[index + 1]).length;
  const contentWidth = Math.max(0, containerSize - handles);
  const minimumTotal = minimumWidths.reduce((total, width) => total + width, 0);
  if (minimumTotal <= 0) return flex;
  if (contentWidth <= minimumTotal) {
    return minimumWidths.map((width) => width / minimumTotal);
  }

  const resolved = children.map(() => 0);
  let remaining = children.flatMap((_, index) => (visible[index] ? [index] : []));
  let remainingWidth = contentWidth;

  while (remaining.length > 0) {
    const totalFlex = remaining.reduce((total, index) => total + flex[index], 0);
    const belowMinimum = remaining.filter(
      (index) => (remainingWidth * flex[index]) / totalFlex < minimumWidths[index],
    );
    if (belowMinimum.length === 0) {
      for (const index of remaining) {
        resolved[index] = (remainingWidth * flex[index]) / totalFlex / contentWidth;
      }
      break;
    }
    for (const index of belowMinimum) {
      resolved[index] = minimumWidths[index] / contentWidth;
      remainingWidth -= minimumWidths[index];
    }
    remaining = remaining.filter((index) => !belowMinimum.includes(index));
  }

  return resolved;
}

/** Dragging visible panes must not overwrite the widths of retained, hidden panes. */
export function restoreHiddenGroupSizes({
  children,
  sizes,
  maximizedPaneId,
  visibleFlex,
}: VisibleGroupInput & { visibleFlex: number[] }): number[] {
  const visibleTotal = children.reduce(
    (total, child, index) =>
      isSplitNodeHiddenForPresentation(child, maximizedPaneId)
        ? total
        : total + (sizes[index] ?? 1),
    0,
  );
  return children.map((child, index) =>
    isSplitNodeHiddenForPresentation(child, maximizedPaneId)
      ? (sizes[index] ?? 1)
      : (visibleFlex[index] ?? 0) * visibleTotal,
  );
}

export function isSplitNodeHiddenForPresentation(
  node: SplitNode,
  maximizedPaneId: string | null,
): boolean {
  return (
    isSplitNodeHidden(node) ||
    Boolean(maximizedPaneId && !splitNodeContainsPane(node, maximizedPaneId))
  );
}

function isSplitNodeHidden(node: SplitNode): boolean {
  if (node.kind === "pane") return node.pane.hidden === true;
  return node.group.children.every(isSplitNodeHidden);
}
