import type { ReactNode, RefCallback } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** The retained sidebar keeps the same parent when it floats over a narrow split layout. */
export function DesktopSidebarFrame({
  overlay,
  onClose,
  scopeRef,
  children,
}: {
  overlay: boolean;
  onClose: () => void;
  scopeRef: RefCallback<View>;
  children: ReactNode;
}) {
  return (
    <>
      {overlay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sidebar"
          onPress={onClose}
          style={styles.backdrop}
          testID="desktop-sidebar-backdrop"
        />
      ) : null}
      <View
        ref={scopeRef}
        style={[styles.frame, overlay && styles.drawer]}
        role={overlay ? "dialog" : undefined}
        aria-modal={overlay || undefined}
        accessibilityLabel={overlay ? "Chats" : undefined}
        testID={overlay ? "desktop-sidebar-drawer" : "desktop-sidebar-frame"}
      >
        {children}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  frame: { flexShrink: 0, flexDirection: "row" },
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 6 },
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 5,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
});
