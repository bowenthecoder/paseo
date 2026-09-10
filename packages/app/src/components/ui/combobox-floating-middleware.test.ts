import { computePosition, type Platform } from "@floating-ui/core";
import { describe, expect, it, vi } from "vitest";

import { buildComboboxFloatingMiddleware } from "./combobox-floating-middleware";

// Exercise the real positioning algorithms without loading the native hook adapter.
vi.mock("@floating-ui/react-native", async () => await import("@floating-ui/core"));

async function placePicker(input: {
  anchorTop: number;
  viewportHeight?: number;
  preferredHeight?: number;
  placement?: "top-start" | "bottom-start";
  isWeb?: boolean;
  isDesktopAboveSearch?: boolean;
}) {
  const viewportHeight = input.viewportHeight ?? 720;
  const preferredHeight = input.preferredHeight ?? 580;
  const placement = input.placement ?? "bottom-start";
  let height = preferredHeight;
  let availableHeight = 0;
  const platform: Platform = {
    getElementRects: () => ({
      reference: { x: 405, y: input.anchorTop, width: 470, height: 34 },
      floating: { x: 0, y: 0, width: 470, height },
    }),
    getClippingRect: () => ({ x: 0, y: 0, width: 1280, height: viewportHeight }),
    getDimensions: () => ({ width: 470, height }),
  };
  const result = await computePosition(
    {},
    {},
    {
      placement,
      platform,
      middleware: buildComboboxFloatingMiddleware({
        collisionPadding: 16,
        isWeb: input.isWeb ?? true,
        desktopPlacement: placement,
        isDesktopAboveSearch: input.isDesktopAboveSearch ?? false,
        onSize(size) {
          availableHeight = size.availableHeight;
          height = Math.min(preferredHeight, Math.max(0, availableHeight));
        },
      }),
    },
  );
  return { ...result, height, availableHeight };
}

describe("combobox floating placement", () => {
  it("opens the schedule model picker above a low trigger so the footer cannot consume its list", async () => {
    const result = await placePicker({ anchorTop: 534 });

    expect(result.placement).toBe("top-start");
    expect(result.y).toBe(16);
    expect(result.height).toBe(513);
    expect(result.y + result.height).toBe(529);
  });

  it("keeps the preferred bottom placement when the full picker fits", async () => {
    const result = await placePicker({ anchorTop: 80 });

    expect(result.placement).toBe("bottom-start");
    expect(result.y).toBe(119);
    expect(result.height).toBe(580);
    expect(result.y + result.height).toBe(699);
  });

  it.each([false, true])(
    "preserves a measured top-start composer anchor with above-search=%s",
    async (isDesktopAboveSearch) => {
      const result = await placePicker({
        anchorTop: 80,
        placement: "top-start",
        isDesktopAboveSearch,
      });

      expect(result.placement).toBe("top-start");
      expect(result.y).toBe(16);
      expect(result.height).toBe(59);
      expect(result.y + result.height).toBe(75);
    },
  );

  it("preserves native flipping and the native anchor gap", async () => {
    const result = await placePicker({ anchorTop: 534, isWeb: false });

    expect(result.placement).toBe("top-start");
    expect(result.y).toBe(16);
    expect(result.height).toBe(514);
    expect(result.y + result.height).toBe(530);
  });
});
