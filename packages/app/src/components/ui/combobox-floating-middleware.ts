import { flip, offset, shift, size } from "@floating-ui/react-native";

interface ComboboxFloatingMiddlewareInput {
  collisionPadding: number;
  isWeb: boolean;
  desktopPlacement: "top-start" | "bottom-start";
  isDesktopAboveSearch: boolean;
  onSize: (size: {
    availableWidth: number;
    availableHeight: number;
    referenceWidth: number;
  }) => void;
}

export function buildComboboxFloatingMiddleware(input: ComboboxFloatingMiddlewareInput) {
  const { collisionPadding, isWeb, desktopPlacement, isDesktopAboveSearch, onSize } = input;
  // Top-start composer pickers are positioned from their measured bottom edge.
  // Other desktop pickers must choose the roomier side before their height is
  // capped, or a low form field can leave only enough space for header + footer.
  const canFlip = !isWeb || (desktopPlacement === "bottom-start" && !isDesktopAboveSearch);
  return [
    offset(isWeb ? 5 : 4),
    ...(canFlip ? [flip({ padding: collisionPadding })] : []),
    ...(isDesktopAboveSearch ? [] : [shift({ padding: collisionPadding })]),
    size({
      padding: collisionPadding,
      apply({ availableWidth, availableHeight, rects }) {
        onSize({ availableWidth, availableHeight, referenceWidth: rects.reference.width });
      },
    }),
  ];
}
