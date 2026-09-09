import { describe, expect, it } from "vitest";
import { canDesktopAppSidebarShare } from "@/components/desktop-sidebar-layout";
import { resolveResponsiveSidebarPresentation } from "./responsive-sidebar-state";

const viewportWidth = 800;
const requestedSidebarWidth = 320;

function presentation(contentMinimumWidth: number, explicitlyRevealed: boolean) {
  return resolveResponsiveSidebarPresentation({
    enabled: true,
    requestedOpen: true,
    canShare: canDesktopAppSidebarShare({
      viewportWidth,
      requestedSidebarWidth,
      contentMinimumWidth,
    }),
    explicitlyRevealed,
  });
}

describe("responsive sidebar presentation", () => {
  it("turns a width-hidden preference into an inline sidebar after Explorer yields", () => {
    expect(presentation(640, false)).toBe("hidden");
    expect(presentation(400, true)).toBe("inline");
  });

  it("keeps multiple main panes intact while explicit navigation uses an overlay", () => {
    expect(presentation(800, false)).toBe("hidden");
    expect(presentation(800, true)).toBe("overlay");
  });

  it("honors closing, disabled chrome, and compact overlays even after explicit reveal", () => {
    const input = { enabled: true, requestedOpen: true, canShare: false, explicitlyRevealed: true };
    expect(resolveResponsiveSidebarPresentation({ ...input, requestedOpen: false })).toBe("hidden");
    expect(resolveResponsiveSidebarPresentation({ ...input, enabled: false })).toBe("hidden");
  });
});
