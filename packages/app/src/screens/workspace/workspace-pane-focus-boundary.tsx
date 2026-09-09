import { useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { isWeb } from "@/constants/platform";

const focusBoundaryStyle = { display: "flex", flex: 1, minWidth: 0, minHeight: 0 } as const;

/** A pane becomes the keyboard target before its descendant handles pointer or focus input. */
export function WorkspacePaneFocusBoundary({
  onFocus,
  children,
}: {
  onFocus: () => void;
  children: ReactNode;
}) {
  const captureTouch = useCallback(() => {
    onFocus();
    return false;
  }, [onFocus]);
  if (isWeb) {
    return (
      <div style={focusBoundaryStyle} onPointerDownCapture={onFocus} onFocusCapture={onFocus}>
        {children}
      </div>
    );
  }
  return (
    <View style={focusBoundaryStyle} onStartShouldSetResponderCapture={captureTouch}>
      {children}
    </View>
  );
}
