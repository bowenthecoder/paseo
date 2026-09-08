import { describe, expect, it } from "vitest";
import { buildWorkspaceExplorerStateKey } from "./use-file-explorer-actions";

describe("file explorer state scope", () => {
  it("keeps separate root expansion state for different hosts", () => {
    expect(buildWorkspaceExplorerStateKey({ serverId: "macbook", workspaceRoot: "/" })).toBe(
      "host:macbook:root:/",
    );
    expect(buildWorkspaceExplorerStateKey({ serverId: "jarvis", workspaceRoot: "/" })).toBe(
      "host:jarvis:root:/",
    );
  });

  it("preserves the existing working-folder state key", () => {
    expect(
      buildWorkspaceExplorerStateKey({
        serverId: "macbook",
        workspaceId: "work",
        workspaceRoot: "/repo",
      }),
    ).toBe("workspace:work");
    expect(buildWorkspaceExplorerStateKey({ serverId: "macbook", workspaceRoot: "" })).toBeNull();
  });
});
