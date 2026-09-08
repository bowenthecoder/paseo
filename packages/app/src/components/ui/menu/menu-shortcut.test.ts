import { describe, expect, it } from "vitest";
import { menuShortcutKey } from "./menu-shortcut";

const event = {
  key: "P",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  isComposing: false,
};
describe("menu action letters", () => {
  it("accepts either letter case", () => {
    expect(menuShortcutKey(event, false)).toBe("p");
    expect(menuShortcutKey({ ...event, key: "r" }, false)).toBe("r");
  });
  it("leaves editing, composition, held keys and app shortcuts alone", () => {
    expect(menuShortcutKey(event, true)).toBeNull();
    for (const flag of ["metaKey", "ctrlKey", "altKey", "repeat", "isComposing"] as const) {
      expect(menuShortcutKey({ ...event, [flag]: true }, false)).toBeNull();
    }
    expect(menuShortcutKey({ ...event, key: "Enter" }, false)).toBeNull();
  });
});
