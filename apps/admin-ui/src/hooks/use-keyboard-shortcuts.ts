// Keyboard shortcuts hook for navigation and actions

import { useEffect, useCallback, useRef } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

type KeySequence = string | string[];

interface ShortcutConfig {
  key: KeySequence;
  action: () => void;
  description?: string;
  // If true, don't trigger when typing in input/textarea
  ignoreInputs?: boolean;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: ShortcutConfig[];
  enabled?: boolean;
}

interface ShortcutRegistration {
  shortcutsRef: { current: ShortcutConfig[] };
  sequence: string[];
  timeoutRef: { current: ReturnType<typeof setTimeout> | null };
}

const registrations = new Set<ShortcutRegistration>();
let isListenerAttached = false;

function normalizeKey(event: KeyboardEvent) {
  let key = event.key.toLowerCase();
  if (event.metaKey) key = `meta+${key}`;
  if (event.ctrlKey) key = `ctrl+${key}`;
  if (event.altKey) key = `alt+${key}`;
  if (event.shiftKey && key.length === 1) key = `shift+${key}`;
  return key;
}

function isTypingInInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

function resetRegistrationSequence(registration: ShortcutRegistration) {
  registration.sequence = [];
  if (registration.timeoutRef.current) {
    clearTimeout(registration.timeoutRef.current);
    registration.timeoutRef.current = null;
  }
}

function scheduleSequenceReset(registration: ShortcutRegistration) {
  if (registration.timeoutRef.current) {
    clearTimeout(registration.timeoutRef.current);
  }

  registration.timeoutRef.current = setTimeout(() => {
    registration.sequence = [];
  }, 1000);
}

function onDocumentKeyDown(event: KeyboardEvent) {
  const key = normalizeKey(event);
  const isInput = isTypingInInput(event.target);
  const orderedRegistrations = Array.from(registrations).reverse();

  for (const registration of orderedRegistrations) {
    registration.sequence.push(key);
    if (registration.sequence.length > 8) {
      registration.sequence.shift();
    }
    scheduleSequenceReset(registration);

    const shortcuts = registration.shortcutsRef.current ?? [];
    const sequence = registration.sequence.join(" ");

    for (const shortcut of shortcuts) {
      if (shortcut.ignoreInputs !== false && isInput) continue;

      const keys = Array.isArray(shortcut.key) ? shortcut.key : [shortcut.key];
      const matched = keys.some((entry) => {
        const normalized = entry.toLowerCase();
        return normalized === key || normalized === sequence;
      });

      if (matched) {
        event.preventDefault();
        shortcut.action();
        resetRegistrationSequence(registration);
        return;
      }
    }
  }
}

function ensureGlobalListener() {
  if (isListenerAttached || typeof document === "undefined") return;
  document.addEventListener("keydown", onDocumentKeyDown);
  isListenerAttached = true;
}

function teardownGlobalListener() {
  if (!isListenerAttached || registrations.size > 0) return;
  document.removeEventListener("keydown", onDocumentKeyDown);
  isListenerAttached = false;
}

function registerShortcuts(registration: ShortcutRegistration) {
  registrations.add(registration);
  ensureGlobalListener();
}

function unregisterShortcuts(registration: ShortcutRegistration) {
  resetRegistrationSequence(registration);
  registrations.delete(registration);
  teardownGlobalListener();
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts);
  const registrationRef = useRef<ShortcutRegistration | null>(null);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) {
      if (registrationRef.current) {
        unregisterShortcuts(registrationRef.current);
        registrationRef.current = null;
      }
      return;
    }

    const registration: ShortcutRegistration = {
      shortcutsRef,
      sequence: [],
      timeoutRef: { current: null },
    };
    registrationRef.current = registration;
    registerShortcuts(registration);

    return () => {
      if (registrationRef.current) {
        unregisterShortcuts(registrationRef.current);
        registrationRef.current = null;
      }
    };
  }, [enabled]);
}

// Pre-built navigation shortcuts
export function useNavigationShortcuts(enabled = true) {
  const navigate = useNavigate();
  const router = useRouter();

  const preloadAndNavigate = useCallback(
    (to: string) => {
      void router.preloadRoute({ to });
      void navigate({ to, search: {} });
    },
    [navigate, router],
  );

  const shortcuts: ShortcutConfig[] = [
    {
      key: "g d",
      action: () => preloadAndNavigate("/"),
      description: "Go to Dashboard",
    },
    {
      key: "g a",
      action: () => preloadAndNavigate("/appointments"),
      description: "Go to Appointments",
    },
    {
      key: "g c",
      action: () => preloadAndNavigate("/calendars"),
      description: "Go to Calendars",
    },
    {
      key: "g t",
      action: () => preloadAndNavigate("/appointment-types"),
      description: "Go to Appointment Types",
    },
    {
      key: "g l",
      action: () => preloadAndNavigate("/locations"),
      description: "Go to Locations",
    },
    {
      key: "g r",
      action: () => preloadAndNavigate("/resources"),
      description: "Go to Resources",
    },
    {
      key: "g p",
      action: () => preloadAndNavigate("/clients"),
      description: "Go to Clients",
    },
    // Legacy alias kept for one release cycle.
    {
      key: "g u",
      action: () => preloadAndNavigate("/clients"),
      description: "Go to Clients",
    },
    {
      key: "g s",
      action: () => preloadAndNavigate("/settings"),
      description: "Go to Settings",
    },
  ];

  useKeyboardShortcuts({ shortcuts, enabled });
}

// List navigation hook
interface UseListNavigationOptions<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen?: (item: T) => void;
  enabled?: boolean;
}

export function useListNavigation<T>({
  items,
  selectedIndex,
  onSelect,
  onOpen,
  enabled = true,
}: UseListNavigationOptions<T>) {
  const moveUp = useCallback(() => {
    if (selectedIndex > 0) {
      onSelect(selectedIndex - 1);
    }
  }, [selectedIndex, onSelect]);

  const moveDown = useCallback(() => {
    if (selectedIndex < items.length - 1) {
      onSelect(selectedIndex + 1);
    }
  }, [selectedIndex, items.length, onSelect]);

  const openSelected = useCallback(() => {
    if (onOpen && items[selectedIndex]) {
      onOpen(items[selectedIndex]);
    }
  }, [onOpen, items, selectedIndex]);

  const shortcuts: ShortcutConfig[] = [
    { key: ["j", "arrowdown"], action: moveDown, description: "Move down" },
    { key: ["k", "arrowup"], action: moveUp, description: "Move up" },
    { key: "enter", action: openSelected, description: "Open selected" },
  ];

  useKeyboardShortcuts({ shortcuts, enabled });

  return { moveUp, moveDown, openSelected };
}

// Focus zone IDs for keyboard navigation
export const FOCUS_ZONES = {
  LIST: "focus-zone-list",
  DETAIL: "focus-zone-detail",
  FILTER: "focus-zone-filter",
} as const;

export type FocusZone = (typeof FOCUS_ZONES)[keyof typeof FOCUS_ZONES];

/**
 * Focus a specific zone by ID.
 * Looks for the first focusable element within the zone.
 */
function focusZone(zoneId: string): boolean {
  const zone = document.getElementById(zoneId);
  if (!zone) return false;

  // Find the first focusable element in the zone
  const focusable = zone.querySelector<HTMLElement>(
    'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], textarea:not([disabled]), select:not([disabled])',
  );

  if (focusable) {
    focusable.focus();
    return true;
  }

  // If no focusable element, try to focus the zone itself if it's focusable
  if (zone.tabIndex >= 0) {
    zone.focus();
    return true;
  }

  return false;
}

interface UseFocusZonesOptions {
  /** Called when Escape is pressed - typically clears selection */
  onEscape?: () => void;
  /** Whether the detail panel is open */
  detailOpen?: boolean;
  /** Whether shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Focus zone keyboard shortcuts for list/detail pages.
 *
 * - Cmd/Ctrl+L: Focus list panel
 * - Cmd/Ctrl+D: Focus detail panel
 * - Cmd/Ctrl+F: Focus filter/search input
 * - Escape: Close detail panel or blur current focus
 *
 * @example
 * ```tsx
 * useFocusZones({
 *   onEscape: clearDetails,
 *   detailOpen,
 * });
 *
 * // In JSX:
 * <ListPanel id={FOCUS_ZONES.LIST}>...</ListPanel>
 * <DetailPanel id={FOCUS_ZONES.DETAIL}>...</DetailPanel>
 * <Input id={FOCUS_ZONES.FILTER} />
 * ```
 */
export function useFocusZones({
  onEscape,
  detailOpen = false,
  enabled = true,
}: UseFocusZonesOptions = {}) {
  const focusList = useCallback(() => {
    focusZone(FOCUS_ZONES.LIST);
  }, []);

  const focusDetail = useCallback(() => {
    if (detailOpen) {
      focusZone(FOCUS_ZONES.DETAIL);
    }
  }, [detailOpen]);

  const focusFilter = useCallback(() => {
    focusZone(FOCUS_ZONES.FILTER);
  }, []);

  const handleEscape = useCallback(() => {
    const activeElement = document.activeElement as HTMLElement | null;

    // If in an input, blur it first
    if (
      activeElement?.tagName === "INPUT" ||
      activeElement?.tagName === "TEXTAREA"
    ) {
      activeElement.blur();
      return;
    }

    // Otherwise, call the escape handler (typically closes detail panel)
    onEscape?.();
  }, [onEscape]);

  const shortcuts: ShortcutConfig[] = [
    {
      key: ["meta+l", "ctrl+l"],
      action: focusList,
      description: "Focus list",
      ignoreInputs: false,
    },
    {
      key: ["meta+d", "ctrl+d"],
      action: focusDetail,
      description: "Focus detail panel",
      ignoreInputs: false,
    },
    {
      key: ["meta+f", "ctrl+f"],
      action: focusFilter,
      description: "Focus filter/search",
      ignoreInputs: false,
    },
    {
      key: "escape",
      action: handleEscape,
      description: "Close/blur",
      ignoreInputs: false,
    },
  ];

  useKeyboardShortcuts({ shortcuts, enabled });

  return { focusList, focusDetail, focusFilter };
}
