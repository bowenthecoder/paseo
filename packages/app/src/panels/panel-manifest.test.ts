import { describe, expect, it } from "vitest";
import { panelResourceKey, panelSupportsHost } from "@/panels/panel-manifest";

describe("panel manifest", () => {
  it("answers host support without React panel registration", () => {
    expect(panelSupportsHost("agent", "main")).toBe(true);
    expect(panelSupportsHost("agent", "explorer")).toBe(false);
    expect(panelSupportsHost("draft", "main")).toBe(true);
    expect(panelSupportsHost("draft", "explorer")).toBe(false);
    expect(panelSupportsHost("subagents", "main")).toBe(true);
    expect(panelSupportsHost("subagents", "explorer")).toBe(false);
    expect(panelSupportsHost("provider_subagent", "main")).toBe(true);
    expect(panelSupportsHost("provider_subagent", "explorer")).toBe(false);
    expect(panelSupportsHost("file", "explorer")).toBe(true);
    expect(panelSupportsHost("file", "main")).toBe(false);
    expect(panelSupportsHost("working_diff", "explorer")).toBe(true);
    expect(panelSupportsHost("working_diff", "main")).toBe(false);
    expect(panelSupportsHost("terminal", "explorer")).toBe(true);
    expect(panelSupportsHost("terminal", "main")).toBe(false);
    expect(panelSupportsHost("browser", "explorer")).toBe(true);
    expect(panelSupportsHost("browser", "main")).toBe(false);
    expect(panelSupportsHost("files", "explorer")).toBe(true);
    expect(panelSupportsHost("files", "main")).toBe(false);
    expect(panelSupportsHost("changes_tree", "explorer")).toBe(true);
    expect(panelSupportsHost("changes_tree", "main")).toBe(false);
    expect(panelSupportsHost("pull_request", "explorer")).toBe(true);
    expect(panelSupportsHost("pull_request", "main")).toBe(false);
    expect(panelSupportsHost("commit_diff", "explorer")).toBe(true);
    expect(panelSupportsHost("commit_diff", "main")).toBe(false);
    expect(panelSupportsHost("setup", "explorer")).toBe(true);
    expect(panelSupportsHost("setup", "main")).toBe(false);
    expect(panelSupportsHost("new_tab", "main")).toBe(true);
    expect(panelSupportsHost("new_tab", "explorer")).toBe(true);
    expect(panelSupportsHost("plugin", "main")).toBe(true);
    expect(panelSupportsHost("plugin", "explorer")).toBe(true);
  });

  it("keeps durable resource identity separate from transient target input", () => {
    expect(
      panelResourceKey({ kind: "working_diff", focusPath: "src/a.ts", focusRequestId: 1 }),
    ).toBe(panelResourceKey({ kind: "working_diff", focusPath: "src/b.ts", focusRequestId: 2 }));
    expect(panelResourceKey({ kind: "file", path: "src/a.ts" })).not.toBe(
      panelResourceKey({ kind: "file", path: "src/b.ts" }),
    );
  });
});
