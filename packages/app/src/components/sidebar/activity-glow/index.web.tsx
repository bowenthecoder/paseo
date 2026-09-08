import { memo, useLayoutEffect, useRef } from "react";
import { View } from "react-native";
import { isWeb } from "@/constants/platform";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppVisible } from "@/hooks/use-app-visible";
import { ACTIVITY_GLOW_PERIOD_MS, ActivityGlowMark, activityGlowLayout } from "./mark";

const keyframes: PropertyIndexedKeyframes = {
  opacity: [0.6, 0.95, 0.6],
  transform: ["scale(0.95)", "scale(1.1)", "scale(0.95)"],
};

export const SidebarActivityGlow = memo(function SidebarActivityGlow() {
  const ref = useRef<View>(null);
  const retainedActive = useRetainedPanelActive();
  const appVisible = useAppVisible();

  useLayoutEffect(() => {
    if (!isWeb || !retainedActive || !appVisible) return;
    const element = ref.current;
    if (!(element instanceof HTMLElement)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | null = null;
    const update = () => {
      animation?.cancel();
      animation = null;
      if (preference.matches) return;
      animation = element.animate(keyframes, {
        duration: ACTIVITY_GLOW_PERIOD_MS,
        easing: "ease-in-out",
        iterations: Number.POSITIVE_INFINITY,
      });
      // Every visible chat breathes in phase on the browser's compositor timeline.
      animation.startTime = 0;
    };
    update();
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      animation?.cancel();
    };
  }, [appVisible, retainedActive]);

  return (
    <View
      ref={ref}
      style={activityGlowLayout.frame}
      accessibilityLabel="Running"
      testID="sidebar-activity-glow"
    >
      <ActivityGlowMark />
    </View>
  );
});
