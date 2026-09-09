import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

/**
 * Where a panel may render. A workspace is one chat plus one side panel, so `main` is the
 * chat surface and `explorer` is that side panel. The lists below are what routes an open
 * request: supporting tools use the side panel, while the target resolver distinguishes
 * root conversations from their managed children. The persisted spelling stays `explorer`
 * because plugin panels declare that location by name.
 */
export type PaneHost = "main" | "explorer";

export interface PanelManifest<K extends WorkspaceTabTarget["kind"] = WorkspaceTabTarget["kind"]> {
  kind: K;
  supportedHosts: readonly PaneHost[];
  resourceKey(target: Extract<WorkspaceTabTarget, { kind: K }>): string;
}

type PanelManifestByKind = {
  [K in WorkspaceTabTarget["kind"]]: PanelManifest<K>;
};

const manifests = {
  new_tab: {
    kind: "new_tab",
    supportedHosts: ["main", "explorer"],
    resourceKey: () => "new_tab",
  },
  draft: {
    kind: "draft",
    supportedHosts: ["main"],
    resourceKey: (target) => target.draftId,
  },
  agent: {
    kind: "agent",
    // Root conversations stay in main; managed children use the supporting host.
    supportedHosts: ["main", "explorer"],
    resourceKey: (target) => target.agentId,
  },
  provider_subagent: {
    kind: "provider_subagent",
    supportedHosts: ["explorer"],
    resourceKey: (target) => `${target.parentAgentId}:${target.subagentId}`,
  },
  subagents: {
    kind: "subagents",
    supportedHosts: ["explorer"],
    resourceKey: (target) => target.parentAgentId,
  },
  terminal: {
    kind: "terminal",
    supportedHosts: ["explorer"],
    resourceKey: (target) => target.terminalId,
  },
  browser: {
    kind: "browser",
    supportedHosts: ["explorer"],
    resourceKey: (target) => target.browserId,
  },
  changes_tree: {
    kind: "changes_tree",
    supportedHosts: ["explorer"],
    resourceKey: () => "changes_tree",
  },
  files: {
    kind: "files",
    supportedHosts: ["explorer"],
    resourceKey: () => "files",
  },
  pull_request: {
    kind: "pull_request",
    supportedHosts: ["explorer"],
    resourceKey: () => "pull_request",
  },
  file: {
    kind: "file",
    supportedHosts: ["explorer"],
    resourceKey: (target) => target.path,
  },
  working_diff: {
    kind: "working_diff",
    supportedHosts: ["explorer"],
    resourceKey: (target) =>
      target.workspaceId ? `workspace:${target.workspaceId}` : "working_diff",
  },
  plugin: {
    kind: "plugin",
    // Plugin targets are narrowed by the target-aware plugin panel capability resolver.
    supportedHosts: ["main", "explorer"],
    resourceKey: (target) =>
      target.context === "agent"
        ? `${target.pluginId}:${target.panelId}:agent:${target.agentId}`
        : `${target.pluginId}:${target.panelId}:workspace`,
  },
  setup: {
    kind: "setup",
    supportedHosts: ["explorer"],
    resourceKey: (target) => target.workspaceId,
  },
  commit_diff: {
    kind: "commit_diff",
    supportedHosts: ["explorer"],
    resourceKey: (target) => target.sha,
  },
} satisfies PanelManifestByKind;

export function getPanelManifest<K extends WorkspaceTabTarget["kind"]>(kind: K): PanelManifest<K> {
  return manifests[kind] as unknown as PanelManifest<K>;
}

export function panelSupportsHost(kind: WorkspaceTabTarget["kind"], host: PaneHost): boolean {
  return getPanelManifest(kind).supportedHosts.includes(host);
}

export function panelResourceKey(target: WorkspaceTabTarget): string {
  const manifest = getPanelManifest(target.kind);
  return `${target.kind}:${manifest.resourceKey(target as never)}`;
}
