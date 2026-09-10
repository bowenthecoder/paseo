import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useModelPickerUsage } from "@/provider-usage/use-model-picker-usage";
import { ProviderUsageCard } from "@/provider-usage/card";

export interface ModelPickerEffort {
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

function EffortOption({
  id,
  label,
  selected,
  disabled,
  onSelect,
}: {
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const state = useMemo(() => ({ checked: selected, disabled }), [selected, disabled]);
  const style = useMemo(
    () => [styles.option, selected && styles.selected, disabled && styles.disabled],
    [selected, disabled],
  );
  const select = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <Pressable
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityState={state}
      disabled={disabled}
      onPress={select}
      style={style}
      testID={`model-picker-effort-${id}`}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

export function ModelPickerDetails({
  serverId,
  providerId,
  activeProviderId,
  effort,
  enabled,
}: {
  serverId: string | null;
  providerId: string;
  activeProviderId: string;
  effort?: ModelPickerEffort;
  enabled: boolean;
}) {
  const { view, refresh, canFetch } = useModelPickerUsage(serverId, providerId, enabled);
  const [refreshError, setRefreshError] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshError(false);
    void refresh().catch(() => setRefreshError(true));
  }, [refresh]);
  const usage =
    view.kind === "ready"
      ? view.payload.providers.find((entry) => entry.providerId === providerId)
      : undefined;
  const refreshing = view.kind === "ready" && view.isRefreshing;
  let message = "Usage unavailable for this account";
  if (view.kind === "loading") message = "Loading usage…";
  if (view.kind === "error") message = view.message;
  return (
    <>
      {effort && effort.options.length > 0 && providerId === activeProviderId ? (
        <View style={styles.details}>
          <Text style={styles.label}>Effort</Text>
          <View style={styles.options}>
            {effort.options.map((option) => (
              <EffortOption
                key={option.id}
                id={option.id}
                label={option.label}
                selected={effort.selectedId === option.id}
                disabled={effort.disabled}
                onSelect={effort.onSelect}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.details} testID="model-picker-usage">
        {usage ? (
          <ProviderUsageCard usage={usage} compact />
        ) : (
          <Text style={styles.label}>{message}</Text>
        )}
        {refreshError ? <Text style={styles.label}>Usage refresh failed. Try again.</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={!canFetch || refreshing}
          onPress={handleRefresh}
        >
          <Text style={styles.label}>{refreshing ? "Refreshing…" : "Refresh usage"}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  details: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: theme.colors.border },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  option: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  selected: { backgroundColor: theme.colors.surface2 },
  disabled: { opacity: 0.5 },
  text: { color: theme.colors.foreground, fontSize: 13 },
  label: { color: theme.colors.foregroundMuted, fontSize: 12 },
}));
