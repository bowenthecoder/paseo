import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { useShallow } from "zustand/react/shallow";
import { AgentStreamView } from "@/agent-stream/view";
import { getProviderIcon } from "@/components/provider-icons";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { usePaneContext } from "@/panels/pane-context";
import { createAgentPaneContext } from "@/panels/agent-pane-context";
import { definePanel, type PanelDescriptor } from "@/panels/panel-registry";
import { useSessionStore } from "@/stores/session-store";
import {
  providerSubagentKey,
  providerSubagentLifecycleStatus,
  refreshProviderSubagents,
  useProviderSubagentStore,
} from "@/subagents/provider-store";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import type { PendingPermission } from "@/types/shared";
import type { StreamItem } from "@/types/stream";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";
import { TIMELINE_FETCH_PAGE_SIZE } from "@/timeline/timeline-fetch-policy";
import type { TurnPresentation } from "@/timeline/turn-liveness";

const EMPTY_PERMISSIONS = new Map<string, PendingPermission>();
const EMPTY_STREAM_ITEMS: StreamItem[] = [];

function formatProviderLabel(provider: string): string {
  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function useProviderSubagentDescriptor(
  target: { kind: "provider_subagent"; parentAgentId: string; subagentId: string },
  context: { serverId: string },
): PanelDescriptor {
  const descriptor = useProviderSubagentStore((state) =>
    state.descriptors.get(
      providerSubagentKey(context.serverId, target.parentAgentId, target.subagentId),
    ),
  );
  const parentProvider = useSessionStore(
    (state) => state.sessions[context.serverId]?.agents.get(target.parentAgentId)?.provider,
  );
  const provider = descriptor?.provider ?? parentProvider ?? "agent";
  // The task names the tab; the subagent type is supporting detail beside the provider.
  const subagentType = descriptor?.title?.trim();
  const label = descriptor?.description?.trim() || subagentType || "Subagent";
  const providerLabel = `${formatProviderLabel(provider)} subagent`;
  return {
    label,
    subtitle:
      subagentType && subagentType !== label ? `${subagentType} · ${providerLabel}` : providerLabel,
    tooltip: label,
    titleState: descriptor ? "ready" : "loading",
    icon: getProviderIcon(provider),
    statusBucket: descriptor
      ? deriveSidebarStateBucket({
          status: providerSubagentLifecycleStatus(descriptor.status),
          requiresAttention: descriptor.status === "failed",
        })
      : null,
  };
}

function ProviderTaskLoadError({
  failed,
  supported,
  isConnected,
  onRetry,
}: {
  failed: boolean;
  supported: boolean;
  isConnected: boolean;
  onRetry(): void;
}) {
  const { t } = useTranslation();
  if (!failed && (!supported || isConnected)) return null;
  return (
    <View style={styles.loadError} testID="provider-subagent-load-error">
      <Text style={styles.loadErrorText} accessibilityLiveRegion="polite">
        {isConnected ? t("subagents.loadFailed") : t("subagents.connectToLoad")}
      </Text>
      <Button
        size="sm"
        variant="secondary"
        disabled={!isConnected}
        onPress={onRetry}
        testID="provider-subagent-load-retry"
      >
        {t("common.actions.retry")}
      </Button>
    </View>
  );
}

function ProviderSubagentPanel() {
  const { t } = useTranslation();
  const paneContext = usePaneContext();
  const { serverId, target } = paneContext;
  invariant(target.kind === "provider_subagent", "ProviderSubagentPanel requires provider target");
  const key = providerSubagentKey(serverId, target.parentAgentId, target.subagentId);
  const streamId = `provider:${encodeURIComponent(target.parentAgentId)}:${encodeURIComponent(target.subagentId)}`;
  const { descriptor, timeline } = useProviderSubagentStore(
    useShallow((state) => ({
      descriptor: state.descriptors.get(key) ?? null,
      timeline: state.timelines.get(key) ?? null,
    })),
  );
  const parent = useSessionStore(
    (state) =>
      state.sessions[serverId]?.agents.get(target.parentAgentId) ??
      state.sessions[serverId]?.agentDetails.get(target.parentAgentId) ??
      null,
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const serverInfo = useSessionStore((state) => state.sessions[serverId]?.serverInfo ?? null);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const isActive = useRetainedPanelActive();
  // COMPAT(providerSubagents): added in v0.2.11, remove after 2027-01-12.
  const supported = serverInfo?.features?.providerSubagents === true;
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [failedLoadKey, setFailedLoadKey] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const retryLoad = useCallback(() => setRetryGeneration((generation) => generation + 1), []);

  useEffect(() => {
    if (!client || !supported || !isConnected || !isActive) return;
    let disposed = false;
    setFailedLoadKey(null);
    void Promise.all([
      refreshProviderSubagents(client, serverId, target.parentAgentId),
      client
        .fetchProviderSubagentTimeline(target.parentAgentId, target.subagentId, {
          direction: "tail",
          limit: TIMELINE_FETCH_PAGE_SIZE,
        })
        .then((payload) => {
          if (!disposed) useProviderSubagentStore.getState().replaceTimeline(serverId, payload);
          return undefined;
        }),
    ]).catch(() => {
      if (!disposed) setFailedLoadKey(key);
    });
    return () => {
      disposed = true;
    };
  }, [
    client,
    isActive,
    isConnected,
    key,
    retryGeneration,
    serverId,
    supported,
    target.parentAgentId,
    target.subagentId,
  ]);

  const loadOlder = useCallback((): boolean => {
    if (!client || !supported || isLoadingOlder || !timeline?.hasOlder || !timeline.epoch) {
      return false;
    }
    const firstSeq = timeline.rows.size ? Math.min(...timeline.rows.keys()) : null;
    if (firstSeq === null) return false;
    setIsLoadingOlder(true);
    void client
      .fetchProviderSubagentTimeline(target.parentAgentId, target.subagentId, {
        direction: "before",
        cursor: { epoch: timeline.epoch, seq: firstSeq },
        limit: TIMELINE_FETCH_PAGE_SIZE,
      })
      .then((payload) => {
        useProviderSubagentStore.getState().replaceTimeline(serverId, payload);
        return undefined;
      })
      .catch(() => undefined)
      .finally(() => setIsLoadingOlder(false));
    return true;
  }, [
    client,
    isLoadingOlder,
    serverId,
    supported,
    target.parentAgentId,
    target.subagentId,
    timeline,
  ]);
  const firstTimelineSeq = timeline?.rows.size ? Math.min(...timeline.rows.keys()) : null;
  const progressKey =
    timeline?.epoch && firstTimelineSeq !== null ? `${timeline.epoch}:${firstTimelineSeq}` : null;
  const subtitle = descriptor?.subtitle?.trim();

  const streamContext = useMemo<AgentScreenAgent>(
    () => ({
      serverId,
      id: streamId,
      provider: descriptor?.provider ?? parent?.provider,
      status: descriptor ? providerSubagentLifecycleStatus(descriptor.status) : "initializing",
      cwd: descriptor?.cwd ?? parent?.cwd ?? "",
      workspaceId: parent?.workspaceId,
      projectPlacement: parent?.projectPlacement,
    }),
    [descriptor, parent, serverId, streamId],
  );
  const fileContext = useMemo(
    () => createAgentPaneContext(paneContext, streamContext),
    [paneContext, streamContext],
  );
  const historyPagination = useMemo(
    () => ({
      hasOlder: timeline?.hasOlder === true,
      isLoadingOlder,
      progressKey,
      onLoadOlder: loadOlder,
    }),
    [isLoadingOlder, loadOlder, progressKey, timeline?.hasOlder],
  );
  const turnPresentation = useMemo<TurnPresentation>(
    () => ({
      isActive: descriptor?.status === "running",
      isCancelling: false,
      startedAt: null,
      turnId: null,
    }),
    [descriptor?.status],
  );

  if (serverInfo && !supported) {
    return (
      <View style={styles.unsupported} testID="provider-subagent-panel-unsupported">
        <Text style={styles.unsupportedText}>{t("message.actions.forkUnavailable")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="provider-subagent-panel">
      <ProviderTaskLoadError
        failed={failedLoadKey === key}
        supported={supported}
        isConnected={isConnected}
        onRetry={retryLoad}
      />
      {subtitle ? (
        <View style={styles.subtitleHeader}>
          <Text
            style={styles.subtitleText}
            numberOfLines={3}
            testID="provider-subagent-pane-subtitle"
          >
            {subtitle}
          </Text>
        </View>
      ) : null}
      <AgentStreamView
        agentId={streamId}
        serverId={serverId}
        context={streamContext}
        streamItems={timeline?.tail ?? EMPTY_STREAM_ITEMS}
        streamHead={timeline?.head ?? EMPTY_STREAM_ITEMS}
        turnPresentation={turnPresentation}
        pendingPermissions={EMPTY_PERMISSIONS}
        isAuthoritativeHistoryReady={timeline !== null}
        onOpenWorkspaceFile={fileContext.openFileInWorkspace}
        readOnly
        historyPagination={historyPagination}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, minHeight: 0 },
  loadError: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  loadErrorText: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  subtitleHeader: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  subtitleText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  unsupported: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  unsupportedText: { color: theme.colors.foregroundMuted, textAlign: "center" },
}));

export const providerSubagentPanelRegistration = definePanel("provider_subagent", {
  component: ProviderSubagentPanel,
  useDescriptor: useProviderSubagentDescriptor,
});
