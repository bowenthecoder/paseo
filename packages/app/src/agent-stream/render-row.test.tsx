/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamItem } from "@/types/stream";
import type { StreamLayoutItem } from "./layout";
import { renderHistoryStreamItem, renderLiveHeadStreamItem } from "./render-row";

afterEach(cleanup);

function createInput(phase: StreamLayoutItem["phase"]) {
  const item: StreamItem = {
    kind: "assistant_message",
    id: "diagram-message",
    text: "```mermaid\nflowchart LR\n  Start --> Done\n```",
    timestamp: new Date("2026-09-08T00:00:00Z"),
  };
  const layoutItem: StreamLayoutItem = {
    item,
    phase,
    aboveItem: null,
    belowItem: null,
    gapBelow: 0,
    assistantSpacing: "default",
    completedFooter: null,
    toolSequence: "none",
    isFirstInUserGroup: false,
    isLastInUserGroup: false,
    isLastInToolSequence: false,
    frameOrder: "content-then-footer",
  };
  return {
    item,
    layoutItemById: new Map([[item.id, layoutItem]]),
    renderStreamItem: (layout: StreamLayoutItem) => (
      <iframe title="Diagram runtime" sandbox="" data-phase={layout.phase} />
    ),
  };
}

describe("stream row reconciliation", () => {
  it("keeps the rendered content mounted when a live row becomes completed history", () => {
    const streaming = createInput("streaming");
    const view = render(renderLiveHeadStreamItem(streaming));
    const iframe = view.getByTitle("Diagram runtime");

    view.rerender(renderHistoryStreamItem(createInput("complete")));

    expect(view.getByTitle("Diagram runtime")).toBe(iframe);
    expect(iframe.isConnected).toBe(true);
    expect(iframe.getAttribute("data-phase")).toBe("complete");
  });

  it("refreshes live display state even when its item and renderer identities are unchanged", () => {
    const input = createInput("streaming");
    let expanded = false;
    input.renderStreamItem = () => (
      <iframe title="Diagram runtime" sandbox="" data-expanded={String(expanded)} />
    );
    const view = render(renderLiveHeadStreamItem(input));
    const iframe = view.getByTitle("Diagram runtime");

    expanded = true;
    view.rerender(renderLiveHeadStreamItem(input));

    expect(view.getByTitle("Diagram runtime")).toBe(iframe);
    expect(iframe.getAttribute("data-expanded")).toBe("true");
  });

  it("memoizes untouched history while honoring revised item identities", () => {
    const input = createInput("complete");
    const renderItem = vi.fn(input.renderStreamItem);
    input.renderStreamItem = renderItem;
    const view = render(renderHistoryStreamItem(input));

    view.rerender(renderHistoryStreamItem(input));
    expect(renderItem).toHaveBeenCalledTimes(1);

    view.rerender(renderHistoryStreamItem({ ...input, item: { ...input.item } }));
    expect(renderItem).toHaveBeenCalledTimes(2);
  });
});
