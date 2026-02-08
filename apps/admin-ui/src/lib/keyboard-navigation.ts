// Keyboard navigation helpers for modal and popup interactions

export type ArrowNavigationKey = "ArrowDown" | "ArrowUp";

interface KeyboardNavigationEvent {
  key: string;
  ctrlKey: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation?: () => void;
}

export function getCtrlJkArrowKey(
  event: Pick<
    KeyboardNavigationEvent,
    "key" | "ctrlKey" | "altKey" | "metaKey"
  >,
): ArrowNavigationKey | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === "j") return "ArrowDown";
  if (key === "k") return "ArrowUp";
  return null;
}

function dispatchArrowKey(
  target: EventTarget | null,
  key: ArrowNavigationKey,
): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const arrowEvent = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
  });

  return target.dispatchEvent(arrowEvent);
}

export function handleCtrlJkArrowNavigation(
  event: KeyboardNavigationEvent,
  enabled: boolean,
): boolean {
  if (!enabled) return false;

  const arrowKey = getCtrlJkArrowKey(event);
  if (!arrowKey) return false;

  event.preventDefault();
  event.stopPropagation?.();
  dispatchArrowKey(event.target, arrowKey);
  return true;
}
