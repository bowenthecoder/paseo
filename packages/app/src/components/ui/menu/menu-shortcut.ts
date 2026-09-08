export function menuShortcutKey(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    repeat: boolean;
    isComposing: boolean;
  },
  editing: boolean,
): string | null {
  if (
    editing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.repeat ||
    event.isComposing
  )
    return null;
  return /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : null;
}

/** Called by the web overlay only; the same item click owns pointer and letter actions. */
export function activateMenuShortcut(
  event: KeyboardEvent,
  items: HTMLElement[],
  editing: boolean,
): boolean {
  const shortcut = menuShortcutKey(event, editing);
  const match = shortcut ? items.find((item) => item.dataset.menuShortcut === shortcut) : null;
  if (!match) return false;
  event.preventDefault();
  event.stopPropagation();
  match.click();
  return true;
}

export function isMenuTextInput(target: Element | null): boolean {
  return Boolean(target?.closest('input, textarea, [contenteditable="true"], [role="textbox"]'));
}
