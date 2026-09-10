import { StyleSheet as RNStyleSheet, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export const ACTIVITY_GLOW_PERIOD_MS = 2800;

// Keep the animated wrapper theme-free: Unistyles owns only the inner mark.
export const activityGlowLayout = RNStyleSheet.create({
  frame: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.8,
  },
});

export function ActivityGlowMark() {
  return (
    <>
      <View style={styles.halo} />
      <View style={styles.core} testID="sidebar-activity-glow-core" />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  halo: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.colors.foregroundSidebar ?? theme.colors.foregroundMuted,
    opacity: 0.14,
    boxShadow: `0 0 4px 1px ${theme.colors.foregroundSidebar ?? theme.colors.foregroundMuted}`,
  },
  core: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.foregroundSidebar ?? theme.colors.foregroundMuted,
  },
}));
