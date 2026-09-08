import { memo, useLayoutEffect } from "react";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppVisible } from "@/hooks/use-app-visible";
import { ACTIVITY_GLOW_PERIOD_MS, ActivityGlowMark, activityGlowLayout } from "./mark";

export const SidebarActivityGlow = memo(function SidebarActivityGlow() {
  const retainedActive = useRetainedPanelActive();
  const appVisible = useAppVisible();
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0.5);

  useLayoutEffect(() => {
    if (!retainedActive || !appVisible || reduceMotion) {
      breath.value = 0.5;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, {
        duration: ACTIVITY_GLOW_PERIOD_MS / 2,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [appVisible, breath, reduceMotion, retainedActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + breath.value * 0.35,
    transform: [{ scale: 0.95 + breath.value * 0.15 }],
  }));

  return (
    <Animated.View
      style={[activityGlowLayout.frame, animatedStyle]}
      accessibilityLabel="Running"
      testID="sidebar-activity-glow"
    >
      <ActivityGlowMark />
    </Animated.View>
  );
});
