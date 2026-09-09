import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOptionalPaneContext } from "@/panels/pane-context";
import { findProviderSubagentForToolCall, useProviderSubagentStore } from "./provider-store";

export interface SubagentLink {
  label: string;
  onPress: () => void;
  testID: string;
}

/**
 * A "View" control for a Task card whose provider announced the child it launched. It opens the
 * child's transcript beside the parent, the way a Tasks list row does. Child views never link
 * further down, and a card outside a pane has nowhere to open a view.
 */
export function useSubagentLinkForToolCall(
  toolCallId: string | undefined,
): SubagentLink | undefined {
  const pane = useOptionalPaneContext();
  const { t } = useTranslation();
  const parentAgentId = pane?.target.kind === "agent" ? pane.target.agentId : null;
  const serverId = pane?.serverId ?? null;
  const subagentId = useProviderSubagentStore((state) =>
    toolCallId && parentAgentId && serverId
      ? (findProviderSubagentForToolCall(state.descriptors, serverId, parentAgentId, toolCallId)
          ?.id ?? null)
      : null,
  );
  const openTab = pane?.openTab;
  return useMemo(() => {
    if (!subagentId || !openTab || !parentAgentId) return undefined;
    return {
      label: t("subagents.viewChild"),
      onPress: () => openTab({ kind: "provider_subagent", parentAgentId, subagentId }),
      testID: "tool-call-open-subagent",
    };
  }, [openTab, parentAgentId, subagentId, t]);
}
