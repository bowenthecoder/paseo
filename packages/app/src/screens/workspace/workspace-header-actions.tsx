import { useMemo } from "react";
import { Globe, SquareTerminal } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
} from "@/components/ui/icon-button-chrome";
import type { ShortcutKey } from "@/utils/format-shortcut";

const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedGlobe = withUnistyles(Globe);

const TERMINAL_TOGGLE_KEYS: ShortcutKey[] = ["mod", "`"];
const NO_SHORTCUT_KEYS: ShortcutKey[] = [];

interface WorkspaceHeaderToggleProps {
  isActive: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Terminal and browser both live in the one side panel, so these are toggles rather than
 * openers: pressing the lit one puts the panel away again.
 */
export function WorkspaceHeaderTerminalToggle({
  isActive,
  disabled,
  onPress,
}: WorkspaceHeaderToggleProps) {
  const { t } = useTranslation();
  const accessibilityState = useMemo(
    () => ({ expanded: isActive, disabled: disabled === true }),
    [disabled, isActive],
  );
  return (
    <HeaderToggleButton
      testID="workspace-header-terminal-toggle"
      onPress={onPress}
      disabled={disabled}
      tooltipLabel={t("workspace.header.actions.toggleTerminal")}
      tooltipKeys={TERMINAL_TOGGLE_KEYS}
      tooltipSide="bottom"
      accessible
      accessibilityRole="button"
      accessibilityLabel={t("workspace.header.actions.toggleTerminal")}
      accessibilityState={accessibilityState}
    >
      <ThemedSquareTerminal
        size={iconButtonChromeGlyphSize("large")}
        strokeWidth={1.5}
        uniProps={extraMutedIconColorMapping}
      />
    </HeaderToggleButton>
  );
}

export function WorkspaceHeaderBrowserToggle({
  isActive,
  disabled,
  onPress,
}: WorkspaceHeaderToggleProps) {
  const { t } = useTranslation();
  const accessibilityState = useMemo(
    () => ({ expanded: isActive, disabled: disabled === true }),
    [disabled, isActive],
  );
  return (
    <HeaderToggleButton
      testID="workspace-header-browser-toggle"
      onPress={onPress}
      disabled={disabled}
      tooltipLabel={t("workspace.header.actions.toggleBrowser")}
      tooltipKeys={NO_SHORTCUT_KEYS}
      tooltipSide="bottom"
      accessible
      accessibilityRole="button"
      accessibilityLabel={t("workspace.header.actions.toggleBrowser")}
      accessibilityState={accessibilityState}
    >
      <ThemedGlobe
        size={iconButtonChromeGlyphSize("large")}
        strokeWidth={1.5}
        uniProps={extraMutedIconColorMapping}
      />
    </HeaderToggleButton>
  );
}
