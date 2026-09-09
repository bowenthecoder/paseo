// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuOverlay } from "./menu-overlay";

vi.mock("@/components/ui/floating", () => ({
  FloatingScrollView: "div",
  FloatingSurface: "div",
}));
vi.mock("react-native-reanimated", () => ({
  Keyframe: class {
    duration() {
      return this;
    }
  },
  runOnJS: (callback: () => void) => callback,
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  // Keep focus on the opener, as it is between right-click and the next frame.
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(0);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("menu letters while opening", () => {
  it("runs a letter action before the menu's first focus frame", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const move = vi.fn();
    render(
      <MenuOverlay visible onClose={vi.fn()}>
        <div data-menu-surface="true">
          <button type="button" data-menu-item="true" data-menu-shortcut="m" onClick={move}>
            Move to group
          </button>
        </div>
      </MenuOverlay>,
    );

    expect(document.activeElement).toBe(opener);
    fireEvent.keyDown(opener, { key: "m" });

    expect(move).toHaveBeenCalledOnce();
  });

  it("uses the newly opened submenu when focus is still outside the overlay", () => {
    const rootAction = vi.fn();
    const childAction = vi.fn();
    render(
      <MenuOverlay visible onClose={vi.fn()}>
        <>
          <div data-menu-surface="true">
            <button type="button" data-menu-item="true" data-menu-shortcut="a" onClick={rootAction}>
              Archive chat
            </button>
          </div>
          <div data-menu-surface="true">
            <button
              type="button"
              data-menu-item="true"
              data-menu-shortcut="a"
              onClick={childAction}
            >
              A group
            </button>
          </div>
        </>
      </MenuOverlay>,
    );

    fireEvent.keyDown(document.body, { key: "a" });

    expect(childAction).toHaveBeenCalledOnce();
    expect(rootAction).not.toHaveBeenCalled();
  });

  it.each(["s", "a"])(
    "runs submenu letter %s before focus leaves its parent trigger",
    (shortcut) => {
      const rootAction = vi.fn();
      const childAction = vi.fn();
      function Submenu() {
        const [open, setOpen] = React.useState(false);
        const openChild = React.useCallback(() => setOpen(true), []);
        return (
          <MenuOverlay visible onClose={vi.fn()}>
            <>
              <div data-menu-surface="true">
                <button
                  type="button"
                  data-menu-item="true"
                  data-menu-shortcut="o"
                  onClick={openChild}
                >
                  Open in
                </button>
                <button
                  type="button"
                  data-menu-item="true"
                  data-menu-shortcut="a"
                  onClick={rootAction}
                >
                  Archive chat
                </button>
              </div>
              {open ? (
                <div data-menu-surface="true">
                  <button
                    type="button"
                    data-menu-item="true"
                    data-menu-shortcut={shortcut}
                    onClick={childAction}
                  >
                    Submenu action
                  </button>
                </div>
              ) : null}
            </>
          </MenuOverlay>
        );
      }
      const { getByRole } = render(<Submenu />);
      const trigger = getByRole("button", { name: "Open in" });
      trigger.focus();

      fireEvent.keyDown(trigger, { key: "o" });

      expect(getByRole("button", { name: "Submenu action" })).toBeDefined();
      expect(document.activeElement).toBe(trigger);
      fireEvent.keyDown(trigger, { key: shortcut });

      expect(childAction).toHaveBeenCalledOnce();
      expect(rootAction).not.toHaveBeenCalled();
    },
  );

  it("preserves text input inside a menu page", () => {
    const action = vi.fn();
    const { getByRole } = render(
      <MenuOverlay visible onClose={vi.fn()}>
        <div data-menu-surface="true">
          <input aria-label="Group name" />
          <button type="button" data-menu-item="true" data-menu-shortcut="a" onClick={action}>
            Archive
          </button>
        </div>
      </MenuOverlay>,
    );

    fireEvent.keyDown(getByRole("textbox", { name: "Group name" }), { key: "a" });

    expect(action).not.toHaveBeenCalled();
  });
});
