import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { i18n } from "@/i18n/i18next";

export interface WorkspaceTabMenuLabels {
  copyResumeCommand: string;
  copyAgentId: string;
  copyTerminalId: string;
  copyFilePath: string;
  rename: string;
  reloadAgent: string;
  reloadAgentTooltip: string;
  close: string;
}

export const DEFAULT_WORKSPACE_TAB_MENU_LABELS: WorkspaceTabMenuLabels = {
  copyResumeCommand: i18n.t("workspace.tabs.menu.copyResumeCommand"),
  copyAgentId: i18n.t("workspace.tabs.menu.copyAgentId"),
  copyTerminalId: i18n.t("workspace.tabs.menu.copyTerminalId"),
  copyFilePath: i18n.t("workspace.tabs.menu.copyFilePath"),
  rename: i18n.t("workspace.tabs.menu.rename"),
  reloadAgent: i18n.t("workspace.tabs.menu.reloadAgent"),
  reloadAgentTooltip: i18n.t("workspace.tabs.menu.reloadAgentTooltip"),
  close: i18n.t("workspace.tabs.menu.close"),
};

export type WorkspaceTabMenuEntry =
  | {
      kind: "item";
      key: string;
      label: string;
      icon?:
        | "copy"
        | "rotate-cw"
        | "arrow-left-to-line"
        | "arrow-right-to-line"
        | "copy-x"
        | "pencil"
        | "x";
      hint?: string;
      tooltip?: string;
      disabled?: boolean;
      destructive?: boolean;
      testID: string;
      onSelect: () => void;
    }
  | {
      kind: "separator";
      key: string;
    };

interface BuildWorkspaceTabMenuEntriesInput {
  tab: WorkspaceTabDescriptor;
  menuTestIDBase: string;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyTerminalId: (terminalId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  labels?: WorkspaceTabMenuLabels;
}

export function buildWorkspaceTabMenuEntries(
  input: BuildWorkspaceTabMenuEntriesInput,
): WorkspaceTabMenuEntry[] {
  const {
    tab,
    menuTestIDBase,
    onCopyResumeCommand,
    onCopyAgentId,
    onCopyTerminalId,
    onCopyFilePath,
    onReloadAgent,
    onRenameTab,
    onCloseTab,
  } = input;
  const labels = input.labels ?? DEFAULT_WORKSPACE_TAB_MENU_LABELS;
  const entries: WorkspaceTabMenuEntry[] = [];

  if (tab.target.kind === "agent") {
    const { agentId } = tab.target;
    entries.push({
      kind: "item",
      key: "copy-resume-command",
      label: labels.copyResumeCommand,
      icon: "copy",
      testID: `${menuTestIDBase}-copy-resume-command`,
      onSelect: () => {
        void onCopyResumeCommand(agentId);
      },
    });
    entries.push({
      kind: "item",
      key: "copy-agent-id",
      label: labels.copyAgentId,
      icon: "copy",
      hint: agentId.slice(0, 7),
      testID: `${menuTestIDBase}-copy-agent-id`,
      onSelect: () => {
        void onCopyAgentId(agentId);
      },
    });
  }

  if (tab.target.kind === "terminal") {
    const { terminalId } = tab.target;
    entries.push({
      kind: "item",
      key: "copy-terminal-id",
      label: labels.copyTerminalId,
      icon: "copy",
      hint: terminalId.slice(0, 7),
      testID: `${menuTestIDBase}-copy-terminal-id`,
      onSelect: () => {
        void onCopyTerminalId(terminalId);
      },
    });
  }

  if (tab.target.kind === "file") {
    const filePath = tab.target.path;
    entries.push({
      kind: "item",
      key: "copy-file-path",
      label: labels.copyFilePath,
      icon: "copy",
      testID: `${menuTestIDBase}-copy-file-path`,
      onSelect: () => {
        void onCopyFilePath(filePath);
      },
    });
  }

  if (tab.target.kind === "agent" || tab.target.kind === "terminal") {
    entries.push({
      kind: "item",
      key: "rename",
      label: labels.rename,
      icon: "pencil",
      testID: `${menuTestIDBase}-rename`,
      onSelect: () => {
        onRenameTab(tab);
      },
    });
    entries.push({
      kind: "separator",
      key: "rename-separator",
    });
  }

  if (tab.target.kind === "agent") {
    const { agentId } = tab.target;
    entries.push({
      kind: "item",
      key: "reload-agent",
      label: labels.reloadAgent,
      icon: "rotate-cw",
      tooltip: labels.reloadAgentTooltip,
      testID: `${menuTestIDBase}-reload-agent`,
      onSelect: () => {
        void onReloadAgent(agentId);
      },
    });
  }
  entries.push({
    kind: "item",
    key: "close",
    label: labels.close,
    icon: "x",
    testID: `${menuTestIDBase}-close`,
    onSelect: () => {
      void onCloseTab(tab.tabId);
    },
  });

  return entries;
}
