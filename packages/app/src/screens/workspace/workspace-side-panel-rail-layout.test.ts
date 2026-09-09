import { describe, expect, it } from "vitest";
import { getSidePanelRailScrollOffset } from "./workspace-side-panel-rail-layout";

describe("side panel rail visibility", () => {
  it.each([
    { currentOffset: 0, viewportWidth: 280, itemLeft: 100, itemWidth: 100, expected: 0 },
    { currentOffset: 0, viewportWidth: 280, itemLeft: 500, itemWidth: 190, expected: 410 },
    { currentOffset: 410, viewportWidth: 280, itemLeft: 0, itemWidth: 80, expected: 0 },
    { currentOffset: 200, viewportWidth: 220, itemLeft: 380, itemWidth: 190, expected: 350 },
    { currentOffset: 410, viewportWidth: 600, itemLeft: 500, itemWidth: 190, expected: 410 },
    { currentOffset: 0, viewportWidth: 120, itemLeft: 200, itemWidth: 190, expected: 200 },
    { currentOffset: 80, viewportWidth: 0, itemLeft: 300, itemWidth: 190, expected: 80 },
  ])("reveals $itemLeft + $itemWidth in a $viewportWidth viewport", ({ expected, ...input }) => {
    expect(getSidePanelRailScrollOffset(input)).toBe(expected);
  });
});
