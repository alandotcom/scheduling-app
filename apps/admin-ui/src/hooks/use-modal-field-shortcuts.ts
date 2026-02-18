import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  useKeyboardShortcuts,
  type ShortcutScope,
} from "@/hooks/use-keyboard-shortcuts";

export interface ModalShortcutField {
  id: string;
  key: string;
  description?: string;
  disabled?: boolean;
  openOnFocus?: boolean;
}

interface UseModalFieldShortcutsOptions {
  enabled: boolean;
  fields: ModalShortcutField[];
  scope?: ShortcutScope;
  triggerKey?: string;
  autoHideMs?: number;
}

interface UseModalFieldShortcutsResult {
  hintsVisible: boolean;
  registerField: (fieldId: string) => (element: HTMLElement | null) => void;
  hideHints: () => void;
  showHints: () => void;
  toggleHints: () => void;
}

export const DEFAULT_MODAL_SHORTCUT_HINT_TIMEOUT_MS = 1500;

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role="combobox"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])';

function resolveFocusableElement(element: HTMLElement): HTMLElement | null {
  if (element.matches(FOCUSABLE_SELECTOR)) {
    return element;
  }

  return element.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

function maybeOpenFocusableElement(element: HTMLElement) {
  const isPopupTrigger =
    element.matches('[data-slot="select-trigger"]') ||
    element.getAttribute("role") === "combobox" ||
    element.getAttribute("aria-haspopup") === "listbox";

  if (!isPopupTrigger) return;

  const expanded = element.getAttribute("aria-expanded");
  if (expanded === "true") return;

  // Click mirrors the normal trigger interaction for Base UI select/combobox.
  element.click();
}

export function useModalFieldShortcuts({
  enabled,
  fields,
  scope = "modal",
  triggerKey = "g",
  autoHideMs = DEFAULT_MODAL_SHORTCUT_HINT_TIMEOUT_MS,
}: UseModalFieldShortcutsOptions): UseModalFieldShortcutsResult {
  const [hintsVisible, setHintsVisible] = useState(false);
  const fieldElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const hideHints = useCallback(() => {
    clearHideTimer();
    setHintsVisible(false);
  }, [clearHideTimer]);

  const showHints = useCallback(() => {
    clearHideTimer();
    setHintsVisible(true);

    hideTimerRef.current = setTimeout(() => {
      setHintsVisible(false);
      hideTimerRef.current = null;
    }, autoHideMs);
  }, [autoHideMs, clearHideTimer]);

  const toggleHints = useCallback(() => {
    if (hintsVisible) {
      hideHints();
      return;
    }
    showHints();
  }, [hideHints, hintsVisible, showHints]);

  const focusField = useCallback((field: ModalShortcutField) => {
    const container = fieldElementsRef.current.get(field.id);
    if (!container) return false;

    const element = resolveFocusableElement(container);
    if (!element) return false;

    element.focus();

    if (field.openOnFocus) {
      maybeOpenFocusableElement(element);
    }
    return true;
  }, []);

  const activeFields = useMemo(
    () => fields.filter((field) => !field.disabled),
    [fields],
  );

  const fieldShortcuts = useMemo(
    () =>
      activeFields.map((field) => ({
        key: field.key,
        description: field.description,
        ignoreInputs: false,
        action: () => {
          const focused = focusField(field);
          if (focused) {
            hideHints();
          }
        },
      })),
    [activeFields, focusField, hideHints],
  );

  const registerField = useCallback(
    (fieldId: string) => (element: HTMLElement | null) => {
      if (!element) {
        fieldElementsRef.current.delete(fieldId);
        return;
      }
      fieldElementsRef.current.set(fieldId, element);
    },
    [],
  );

  useEffect(() => {
    if (enabled) return;
    clearHideTimer();
  }, [enabled, clearHideTimer]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  const visibleHints = enabled && hintsVisible;

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: triggerKey,
        action: toggleHints,
        description: "Toggle field shortcut hints",
      },
    ],
    enabled,
    scope,
  });

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "escape",
        action: hideHints,
        ignoreInputs: false,
        description: "Hide field shortcut hints",
      },
    ],
    enabled: visibleHints,
    scope,
  });

  useKeyboardShortcuts({
    shortcuts: fieldShortcuts,
    enabled: visibleHints && fieldShortcuts.length > 0,
    scope,
  });

  return {
    hintsVisible: visibleHints,
    registerField,
    hideHints,
    showHints,
    toggleHints,
  };
}
