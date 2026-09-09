import React, { memo, type ReactNode } from "react";
import type { StreamItem } from "@/types/stream";
import type { StreamLayoutItem } from "./layout";

// History rows sit inside FlatList cells that rerender on every data change (RN recreates each
// CellRenderer with a fresh ref and, in a newest-first list, a shifted index). This boundary is
// what stops that churn: a row renders again only when its stream item identity, its layout item
// identity, or the renderer itself changes. Item identity is the revision signal the strategy
// already uses (`useRevisedHistoryRows` clones items whose content or display state changed).
interface StreamRowProps {
  item: StreamItem;
  layoutItem: StreamLayoutItem;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
  isLive: boolean;
}

// Live and history rows share this component so completing a turn preserves its
// rendered content. Live display updates also come through stable renderer refs,
// so only history rows can skip rendering when their inputs are unchanged.
const StreamRow = memo(
  function StreamRow({ layoutItem, renderStreamItem }: StreamRowProps) {
    return <>{renderStreamItem(layoutItem)}</>;
  },
  (previous, next) =>
    !previous.isLive &&
    !next.isLive &&
    previous.item === next.item &&
    previous.layoutItem === next.layoutItem &&
    previous.renderStreamItem === next.renderStreamItem,
);

export function renderHistoryStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return (
    <StreamRow
      item={input.item}
      layoutItem={layoutItem}
      renderStreamItem={input.renderStreamItem}
      isLive={false}
    />
  );
}

export function renderLiveHeadStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return (
    <StreamRow
      item={input.item}
      layoutItem={layoutItem}
      renderStreamItem={input.renderStreamItem}
      isLive
    />
  );
}
