export function resolveResponsiveSidebarPresentation(input: {
  enabled: boolean;
  requestedOpen: boolean;
  canShare: boolean;
  explicitlyRevealed: boolean;
}): "hidden" | "inline" | "overlay" {
  if (!input.enabled || !input.requestedOpen) return "hidden";
  if (input.canShare) return "inline";
  return input.explicitlyRevealed ? "overlay" : "hidden";
}
