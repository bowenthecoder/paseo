import { afterEach, describe, expect, it } from "vitest";
import { pluginRegistry } from "@/plugins/registry";
import {
  flattenLayoutToSingleChat,
  findPaneById,
  normalizeLayout,
} from "@/stores/workspace-layout-actions";
import { resolveWorkspaceTargetHost } from "./target-host";
import type { WorkspaceTabTarget } from "./model";

const key = "host-1:workspace";
const target: WorkspaceTabTarget = {
  kind: "plugin",
  pluginId: "review",
  panelId: "details",
  context: "agent",
  agentId: "root",
};

function install(locations: readonly ("workspace" | "explorer")[]) {
  pluginRegistry.installCatalog("host-1", [
    {
      id: "review",
      clientBundle: `(function() {
    return { default: function(plugin) {
      plugin.addWorkspacePanel({ id: "details", title: "Details", icon: "Scan",
        context: "agent", locations: ${JSON.stringify(locations)},
        Component: function Details() { return null; } });
      return function() {};
    }};
  })`,
    },
  ]);
}
afterEach(() => pluginRegistry.removeHost("host-1"));

describe("workspace target host", () => {
  it("preserves a saved child host while its agent metadata hydrates", () => {
    const child = { kind: "agent", agentId: "not-yet-hydrated" } as const;
    expect(resolveWorkspaceTargetHost(key, child, "explorer")).toBe("explorer");
    expect(resolveWorkspaceTargetHost(key, child, "main")).toBe("main");
    expect(resolveWorkspaceTargetHost(key, child)).toBe("main");
  });

  it("opens dual-host account/plugin tools in the dock while respecting main-only plugins", () => {
    install(["workspace", "explorer"]);
    expect(resolveWorkspaceTargetHost(key, target, "main")).toBe("explorer");
    install(["workspace"]);
    expect(resolveWorkspaceTargetHost(key, target, "explorer")).toBe("main");
  });

  it("keeps unavailable plugin instances where they were saved", () => {
    expect(resolveWorkspaceTargetHost(key, target, "main")).toBe("main");
    expect(resolveWorkspaceTargetHost(key, target, "explorer")).toBe("explorer");
  });

  it("migrates an already two-pane plugin layout when its contribution loads", () => {
    const legacy = normalizeLayout({
      root: {
        kind: "group",
        group: {
          id: "root",
          direction: "horizontal",
          sizes: [0.8, 0.2],
          children: [
            {
              kind: "pane",
              pane: {
                id: "main",
                tabIds: ["agent_root", "plugin-view"],
                focusedTabId: "agent_root",
                tabs: [
                  {
                    tabId: "agent_root",
                    target: { kind: "agent", agentId: "root" },
                    createdAt: 1,
                  },
                  { tabId: "plugin-view", target, createdAt: 2, state: { retained: true } },
                ],
              },
            },
            {
              kind: "pane",
              pane: {
                id: "explorer",
                tabIds: ["files"],
                focusedTabId: "files",
                hidden: true,
                tabs: [{ tabId: "files", target: { kind: "files" }, createdAt: 3 }],
              },
            },
          ],
        },
      },
      focusedPaneId: "main",
    });
    const resolve = (value: WorkspaceTabTarget, previous?: "main" | "explorer") =>
      resolveWorkspaceTargetHost(key, value, previous);
    expect(flattenLayoutToSingleChat(legacy, resolve)).toBe(legacy);
    install(["explorer"]);
    const flat = flattenLayoutToSingleChat(legacy, resolve);
    expect(findPaneById(flat.root, "main")?.tabIds).toEqual(["agent_root"]);
    expect(findPaneById(flat.root, "main")?.focusedTabId).toBe("agent_root");
    expect(findPaneById(flat.root, "explorer")?.tabIds).toContain("plugin-view");
  });
});
