// Keyboard shortcuts hook for navigation and actions

import { useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

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

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const sequenceRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Clear sequence timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Reset sequence after delay
      timeoutRef.current = setTimeout(() => {
        sequenceRef.current = [];
      }, 1000);

      // Build key string
      let key = e.key.toLowerCase();
      if (e.metaKey) key = `meta+${key}`;
      if (e.ctrlKey) key = `ctrl+${key}`;
      if (e.altKey) key = `alt+${key}`;
      if (e.shiftKey && key.length === 1) key = `shift+${key}`;

      // Add to sequence
      sequenceRef.current.push(key);

      // Check shortcuts
      for (const shortcut of shortcuts) {
        if (shortcut.ignoreInputs !== false && isInput) continue;

        const keys = Array.isArray(shortcut.key)
          ? shortcut.key
          : [shortcut.key];

        // Check if sequence matches
        const sequence = sequenceRef.current.join(" ");
        for (const k of keys) {
          if (sequence === k.toLowerCase() || key === k.toLowerCase()) {
            e.preventDefault();
            shortcut.action();
            sequenceRef.current = [];
            return;
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [shortcuts, enabled]);
}

// Pre-built navigation shortcuts
export function useNavigationShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutConfig[] = [
    {
      key: "g d",
      action: () => void navigate({ to: "/" }),
      description: "Go to Dashboard",
    },
    {
      key: "g a",
      action: () => void navigate({ to: "/appointments", search: {} }),
      description: "Go to Appointments",
    },
    {
      key: "g c",
      action: () => void navigate({ to: "/calendars", search: {} }),
      description: "Go to Calendars",
    },
    {
      key: "g t",
      action: () => void navigate({ to: "/appointment-types", search: {} }),
      description: "Go to Appointment Types",
    },
    {
      key: "g l",
      action: () => void navigate({ to: "/locations", search: {} }),
      description: "Go to Locations",
    },
    {
      key: "g r",
      action: () => void navigate({ to: "/resources", search: {} }),
      description: "Go to Resources",
    },
    {
      key: "g u",
      action: () => void navigate({ to: "/clients", search: {} }),
      description: "Go to Clients",
    },
    {
      key: "g s",
      action: () => void navigate({ to: "/settings", search: {} }),
      description: "Go to Settings",
    },
  ];

  useKeyboardShortcuts({ shortcuts });
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
