import { describe, expect, it } from "vitest";
import type { SplitNode } from "@/stores/workspace-layout-store";
import {
  resolveVisibleGroupFlex,
  restoreHiddenGroupSizes,
} from "@/components/split-container-layout";

function pane(id: string, hidden = false): SplitNode {
  return { kind: "pane", pane: { id, hidden, tabIds: [], focusedTabId: null } };
}

const children = [pane("chat"), pane("document")];
const defaultInput = {
  children,
  sizes: [0.7, 0.3],
  maximizedPaneId: null,
  direction: "horizontal" as const,
  containerSize: 800,
};

describe("main split presentation sizes", () => {
  it("gives both panes room at 800px and restores preferred proportions on a wider window", () => {
    expect(resolveVisibleGroupFlex(defaultInput)).toEqual([0.5, 0.5]);
    expect(defaultInput.sizes).toEqual([0.7, 0.3]);
    expect(resolveVisibleGroupFlex({ ...defaultInput, containerSize: 1601 })).toEqual([0.7, 0.3]);
  });

  it("clamps only the undersized document and preserves the remaining chat width", () => {
    const flex = resolveVisibleGroupFlex({ ...defaultInput, containerSize: 1001 });
    expect(flex).toEqual([0.6, 0.4]);
    expect(flex.map((size) => size * 1000)).toEqual([600, 400]);
  });

  it("redistributes again when reserving one pane makes another too small", () => {
    expect(
      resolveVisibleGroupFlex({
        ...defaultInput,
        children: [pane("chat"), pane("document"), pane("terminal")],
        sizes: [0.64, 0.31, 0.05],
        containerSize: 1602,
      }),
    ).toEqual([0.5, 0.25, 0.25]);
  });

  it("reserves each nested column but lets vertically stacked panes share the same width", () => {
    const group: SplitNode = {
      kind: "group",
      group: {
        id: "nested",
        direction: "horizontal",
        children: [pane("chat"), pane("terminal")],
        sizes: [0.5, 0.5],
      },
    };
    const horizontal = resolveVisibleGroupFlex({
      ...defaultInput,
      children: [group, pane("document")],
      sizes: [0.5, 0.5],
      containerSize: 1201,
    });
    expect(horizontal[0]).toBeCloseTo(2 / 3);
    expect(horizontal[1]).toBeCloseTo(1 / 3);
    expect(
      resolveVisibleGroupFlex({
        ...defaultInput,
        children: [
          { ...group, group: { ...group.group, direction: "vertical" } },
          pane("document"),
        ],
        containerSize: 801,
      }),
    ).toEqual([0.5, 0.5]);
  });

  it("gives hidden and maximized-away panes no width or resize-handle space", () => {
    expect(
      resolveVisibleGroupFlex({
        ...defaultInput,
        children: [...children, pane("retained", true)],
        sizes: [0.2, 0.3, 0.5],
        containerSize: 1001,
      }),
    ).toEqual([0.4, 0.6, 0]);
    expect(resolveVisibleGroupFlex({ ...defaultInput, maximizedPaneId: "document" })).toEqual([
      0, 1,
    ]);
  });

  it("retains hidden pane preferences when the user resizes the visible panes", () => {
    const sizes = [0.25, 0.25, 0.5];
    const next = restoreHiddenGroupSizes({
      children: [...children, pane("retained", true)],
      sizes,
      maximizedPaneId: null,
      visibleFlex: [0.6, 0.4, 0],
    });
    expect(next).toEqual([0.3, 0.2, 0.5]);
    expect(sizes).toEqual([0.25, 0.25, 0.5]);
    expect(
      resolveVisibleGroupFlex({
        ...defaultInput,
        children: [...children, pane("retained")],
        sizes: next,
        containerSize: 2002,
      }),
    ).toEqual([0.3, 0.2, 0.5]);
  });

  it("leaves vertical sizing unchanged", () => {
    expect(
      resolveVisibleGroupFlex({
        ...defaultInput,
        direction: "vertical",
        sizes: [0.9, 0.1],
        containerSize: 300,
      }),
    ).toEqual([0.9, 0.1]);
  });

  it("uses preferred proportions until layout is measured and keeps entirely hidden groups empty", () => {
    expect(resolveVisibleGroupFlex({ ...defaultInput, containerSize: 0 })).toEqual([0.7, 0.3]);
    expect(
      resolveVisibleGroupFlex({
        ...defaultInput,
        children: [pane("chat", true), pane("document", true)],
      }),
    ).toEqual([0, 0]);
  });
});
