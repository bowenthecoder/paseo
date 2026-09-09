import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { i18n } from "@/i18n/i18next";
import { ZoomableViewport } from "./index.web";

const CONTENT_SIZE = { width: 800, height: 600 };
const mounted: { root: Root; container: HTMLDivElement }[] = [];

beforeEach(() => vi.stubGlobal("React", React));

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

function requiredElement(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`viewport did not render ${selector}`);
  }
  return element;
}

describe("ZoomableViewport toolbar", () => {
  it("keeps controls clickable when moving from the canvas across toolbar buttons", async () => {
    const onPressOutsideContent = vi.fn();
    const container = document.createElement("div");
    container.style.cssText = "display:flex;width:480px;height:320px;margin:40px;";
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() =>
      root.render(
        <ZoomableViewport
          contentSize={CONTENT_SIZE}
          onPressOutsideContent={onPressOutsideContent}
          testID="preview"
        >
          Preview content
        </ZoomableViewport>,
      ),
    );

    const canvas = requiredElement(container, '[data-testid="preview-canvas"]');
    const content = requiredElement(canvas, ":scope > div");
    const zoomIn = requiredElement(
      container,
      `button[aria-label="${i18n.t("message.diagram.zoomIn")}"]`,
    );
    const zoomOut = requiredElement(
      container,
      `button[aria-label="${i18n.t("message.diagram.zoomOut")}"]`,
    );
    await expect.poll(() => content.getBoundingClientRect().width).toBeGreaterThan(0);
    const fittedWidth = content.getBoundingClientRect().width;

    await act(async () => userEvent.hover(canvas));
    expect(getComputedStyle(zoomIn).opacity).toBe("1");
    expect(getComputedStyle(zoomIn).pointerEvents).toBe("auto");
    await act(async () => userEvent.hover(zoomIn));
    expect(getComputedStyle(zoomIn).opacity).toBe("1");
    expect(getComputedStyle(zoomIn).pointerEvents).toBe("auto");
    await act(async () => userEvent.click(zoomIn));
    await expect
      .poll(() => content.getBoundingClientRect().width)
      .toBeGreaterThan(fittedWidth * 1.2);

    await act(async () => userEvent.hover(zoomOut));
    expect(getComputedStyle(zoomOut).opacity).toBe("1");
    await act(async () => userEvent.click(zoomOut));
    await expect.poll(() => content.getBoundingClientRect().width).toBeCloseTo(fittedWidth, 1);
    expect(onPressOutsideContent).not.toHaveBeenCalled();
  });
});
