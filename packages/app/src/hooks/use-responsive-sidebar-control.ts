import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isWeb } from "@/constants/platform";
import { useWebOverlayRegistration } from "@/lib/overlay-root";
import { selectIsAgentListOpen, usePanelStore } from "@/stores/panel-store";
import { findPaneById } from "@/stores/workspace-layout-actions";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useActiveWorkspaceLayoutKey } from "./use-workspace-content-minimum";
import { resolveResponsiveSidebarPresentation } from "./responsive-sidebar-state";

interface SidebarMenuControl {
  isOpen: boolean;
  toggle: () => void;
}

export const SidebarMenuControlContext = createContext<SidebarMenuControl | null>(null);

export function useSidebarMenuControl(isCompact: boolean): SidebarMenuControl {
  const control = useContext(SidebarMenuControlContext);
  const isOpen = usePanelStore((state) => selectIsAgentListOpen(state, { isCompact }));
  const toggleAgentListForLayout = usePanelStore((state) => state.toggleAgentListForLayout);
  const toggle = useCallback(
    () => toggleAgentListForLayout({ isCompact }),
    [isCompact, toggleAgentListForLayout],
  );
  return control ?? { isOpen, toggle };
}

/** Explicit navigation makes room before using a temporary drawer over main splits. */
export function useResponsiveSidebarControl(input: {
  isCompact: boolean;
  desktopEnabled: boolean;
  canShare: boolean;
  pathname: string;
}) {
  const { isCompact, desktopEnabled, canShare, pathname } = input;
  const requestedOpen = usePanelStore((state) => state.desktop.agentListOpen);
  const compactOpen = usePanelStore((state) => selectIsAgentListOpen(state, { isCompact: true }));
  const workspaceKey = useActiveWorkspaceLayoutKey();
  const focusedTabId = useWorkspaceLayoutStore((state) => {
    const layout = workspaceKey ? state.layoutByWorkspace[workspaceKey] : null;
    return layout ? (findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null) : null;
  });
  const scope = `${pathname}:${workspaceKey}:${focusedTabId}`;
  const [revealedScope, setRevealedScope] = useState<string | null>(null);
  const presentation = resolveResponsiveSidebarPresentation({
    enabled: !isCompact && desktopEnabled,
    requestedOpen,
    canShare,
    explicitlyRevealed: revealedScope === scope,
  });
  const desktopVisible = presentation !== "hidden";
  const overlay = presentation === "overlay";

  useEffect(() => {
    setRevealedScope((current) => (canShare || isCompact || current !== scope ? null : current));
  }, [canShare, isCompact, scope]);

  const close = useCallback(() => {
    setRevealedScope(null);
    usePanelStore.getState().closeAgentListForLayout({ isCompact });
  }, [isCompact]);
  const toggle = useCallback(() => {
    const panel = usePanelStore.getState();
    if (isCompact) {
      panel.toggleMobileAgentList();
      return;
    }
    if (desktopVisible) {
      close();
      return;
    }
    if (!canShare && workspaceKey) {
      useWorkspaceLayoutStore.getState().hideExplorerSidebar(workspaceKey);
    }
    panel.openDesktopAgentList();
    const layout = workspaceKey
      ? useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey]
      : null;
    const tabId = layout
      ? (findPaneById(layout.root, layout.focusedPaneId)?.focusedTabId ?? null)
      : null;
    setRevealedScope(`${pathname}:${workspaceKey}:${tabId}`);
  }, [canShare, close, desktopVisible, isCompact, pathname, workspaceKey]);
  const onOverlayKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return false;
      event.preventDefault();
      event.stopPropagation();
      close();
      return true;
    },
    [close],
  );
  const overlayScopeRef = useWebOverlayRegistration({
    active: isWeb && overlay,
    layer: 0,
    onKeyDown: onOverlayKeyDown,
  });
  const menu = useMemo(
    () => ({ isOpen: isCompact ? compactOpen : desktopVisible, toggle }),
    [compactOpen, desktopVisible, isCompact, toggle],
  );
  return { menu, desktopVisible, overlay, close, overlayScopeRef };
}
