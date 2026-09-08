import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ContextWindowMeter, type ContextWindowMeterProps } from "./context-window-meter";
import { useModelPickerUsage } from "@/provider-usage/use-model-picker-usage";
import { ProviderUsageTooltipSection } from "@/provider-usage/tooltip-section";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProviderUsage } from "@/provider-usage/types";

function usageLabel(usage: ProviderUsage | undefined): string {
  if (!usage || usage.status !== "available") return "Plan —";
  const percentages = usage.windows.flatMap((window) => {
    if (window.usedPct != null) return [window.usedPct];
    if (window.remainingPct != null) return [100 - window.remainingPct];
    return [];
  });
  if (percentages.length) return `Plan ${Math.round(Math.max(...percentages))}%`;
  const balance = usage.balances?.find((entry) => entry.remaining != null);
  if (balance) return `${balance.remaining} ${balance.unit}`;
  return "Plan —";
}

export function ContextAndAccountUsage(
  props: Omit<ContextWindowMeterProps, "providerUsageView" | "refreshProviderUsage">,
) {
  const { view, refresh } = useModelPickerUsage(
    props.serverId ?? null,
    props.provider ?? "",
    Boolean(props.provider),
  );
  const [open, setOpen] = useState(false);
  const usage =
    view.kind === "ready"
      ? view.payload.providers.find((entry) => entry.providerId === props.provider)
      : undefined;
  const label = view.kind === "loading" ? "Plan …" : usageLabel(usage);
  const [refreshError, setRefreshError] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshError(false);
    void refresh().catch(() => setRefreshError(true));
  }, [refresh]);
  return (
    <View style={styles.row} testID="context-and-account-usage">
      <ContextWindowMeter {...props} providerUsageView={view} refreshProviderUsage={refresh} />
      {props.provider ? (
        <Tooltip
          open={open}
          onOpenChange={setOpen}
          delayDuration={0}
          enabledOnDesktop
          enabledOnMobile
        >
          <TooltipTrigger asChild triggerRefProp="ref">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${props.provider} account usage: ${label}`}
              style={styles.badge}
              onPress={handleRefresh}
              testID="account-usage-badge"
            >
              <Text style={styles.label}>{label}</Text>
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" offset={8}>
            <ProviderUsageTooltipSection view={view} activeProviderId={props.provider} />
            {refreshError ? (
              <Text style={styles.label}>Usage refresh failed. Try again.</Text>
            ) : null}
            <Text style={styles.label}>Click the usage badge to refresh</Text>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  badge: { paddingHorizontal: 5, paddingVertical: 5, borderRadius: 5 },
  label: { color: theme.colors.foregroundMuted, fontSize: 11 },
}));
