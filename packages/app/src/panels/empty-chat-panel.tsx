import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { SquarePen } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel } from "@/panels/panel-registry";
import { generateDraftId } from "@/stores/draft-keys";
import type { Theme } from "@/styles/theme";

const ThemedSquarePen = withUnistyles(SquarePen);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function useEmptyChatDescriptor() {
  const { t } = useTranslation();
  const label = t("workspace.chat.empty.title");
  return {
    label,
    subtitle: label,
    tooltip: label,
    titleState: "ready" as const,
    icon: ThemedSquarePen,
    statusBucket: null,
  };
}

/**
 * What a workspace shows before its first chat. There is nothing to pick between any more —
 * terminals and trees live in the side panel — so the only thing on offer is a new chat.
 */
function EmptyChatPanel() {
  const { t } = useTranslation();
  const { retargetCurrentTab } = usePaneContext();
  const startChat = useCallback(() => {
    retargetCurrentTab({ kind: "draft", draftId: generateDraftId() });
  }, [retargetCurrentTab]);

  return (
    <View style={styles.container} testID="workspace-empty-chat-panel">
      <Text style={styles.title}>{t("workspace.chat.empty.title")}</Text>
      <Pressable
        testID="workspace-empty-chat-start"
        accessibilityRole="button"
        accessibilityLabel={t("workspace.chat.empty.action")}
        onPress={startChat}
        style={styles.action}
      >
        <ThemedSquarePen size={16} uniProps={mutedColorMapping} />
        <Text style={styles.actionLabel}>{t("workspace.chat.empty.action")}</Text>
      </Pressable>
    </View>
  );
}

export const emptyChatPanelRegistration = definePanel("new_tab", {
  component: EmptyChatPanel,
  useDescriptor: useEmptyChatDescriptor,
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[4],
    padding: theme.spacing[6],
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  actionLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
}));
