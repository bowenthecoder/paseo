import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListTodo, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { Button } from "@/components/ui/button";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel } from "@/panels/panel-registry";
import { useSessionStore } from "@/stores/session-store";
import {
  useArchiveFinishedSubagents,
  useArchiveSubagent,
  useDetachSubagent,
  useSubagentsForParent,
} from "@/subagents";
import { SubagentsList } from "@/subagents/track";
import { buildSubagentPillPresentation } from "@/subagents/track-presentation";
import { navigateToAgent } from "@/utils/navigate-to-agent";

function SubagentsPanel() {
  const { t } = useTranslation();
  const { serverId, workspaceId, target, openTab, closeCurrentTab } = usePaneContext();
  invariant(target.kind === "subagents", "SubagentsPanel requires a subagents target");
  const rows = useSubagentsForParent({ serverId, parentAgentId: target.parentAgentId });
  const parentTitle = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(target.parentAgentId)?.title,
  );
  const canDetach = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentDetach === true,
  );
  const archiveSubagent = useArchiveSubagent({ serverId });
  const detachSubagent = useDetachSubagent({ serverId });
  const { status, archiveFinished } = useArchiveFinishedSubagents({
    serverId,
    parentAgentId: target.parentAgentId,
    rows,
  });
  const onArchiveFinished = useCallback(() => {
    void archiveFinished();
  }, [archiveFinished]);
  const onOpenSubagent = useCallback(
    (agentId: string) => {
      const session = useSessionStore.getState().sessions[serverId];
      const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
      if (agent?.workspaceId && agent.workspaceId !== workspaceId) {
        navigateToAgent({ serverId, agentId });
        return;
      }
      openTab({ kind: "agent", agentId });
    },
    [openTab, serverId, workspaceId],
  );
  const onOpenProviderSubagent = useCallback(
    (parentAgentId: string, subagentId: string) => {
      openTab({ kind: "provider_subagent", parentAgentId, subagentId });
    },
    [openTab],
  );
  const summary = buildSubagentPillPresentation(t, rows);

  return (
    <View style={styles.container} testID="subagents-track-header-panel">
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text
            style={styles.title}
            testID="subagents-panel-summary"
            accessibilityLiveRegion="polite"
          >
            {summary.accessibilityLabel}
          </Text>
          {parentTitle ? (
            <Text style={styles.parentTitle} numberOfLines={1}>
              {parentTitle}
            </Text>
          ) : null}
        </View>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={X}
          accessibilityLabel={t("common.actions.close")}
          testID="subagents-panel-close"
          onPress={closeCurrentTab}
        />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <SubagentsList
          rows={rows}
          layout="sidebar"
          onOpenSubagent={onOpenSubagent}
          onOpenProviderSubagent={onOpenProviderSubagent}
          onArchiveSubagent={archiveSubagent}
          onDetachSubagent={canDetach ? detachSubagent : undefined}
          onArchiveFinished={onArchiveFinished}
          archiveFinishedStatus={status}
        />
        {rows.length === 0 && status.kind === "idle" ? (
          <Text style={styles.emptyText}>{t("subagents.empty")}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export const subagentsPanelRegistration = definePanel("subagents", {
  component: SubagentsPanel,
  presentation: {
    label: (t) => t("subagents.tasksTitle"),
    subtitle: (t) => t("subagents.title"),
    tooltip: (t) => t("subagents.title"),
    icon: ListTodo,
  },
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  heading: { flex: 1, minWidth: 0, gap: theme.spacing[1] },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  parentTitle: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingVertical: theme.spacing[2] },
  emptyText: {
    padding: theme.spacing[4],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
