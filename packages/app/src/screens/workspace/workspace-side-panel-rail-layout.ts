export function getSidePanelRailScrollOffset(input: {
  currentOffset: number;
  viewportWidth: number;
  itemLeft: number;
  itemWidth: number;
}): number {
  const { currentOffset, viewportWidth, itemLeft, itemWidth } = input;
  if (viewportWidth <= 0 || itemWidth <= 0) return currentOffset;
  if (itemLeft < currentOffset || itemWidth >= viewportWidth) return Math.max(0, itemLeft);
  const itemRight = itemLeft + itemWidth;
  return itemRight > currentOffset + viewportWidth
    ? Math.max(0, itemRight - viewportWidth)
    : currentOffset;
}
