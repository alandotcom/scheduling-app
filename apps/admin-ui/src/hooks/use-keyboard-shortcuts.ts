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
      action: () => void navigate({ to: "/appointments" }),
      description: "Go to Appointments",
    },
    {
      key: "g c",
      action: () => void navigate({ to: "/calendars", search: {} }),
      description: "Go to Calendars",
    },
    {
      key: "g t",
      action: () => void navigate({ to: "/appointment-types" }),
      description: "Go to Appointment Types",
    },
    {
      key: "g l",
      action: () => void navigate({ to: "/locations" }),
      description: "Go to Locations",
    },
    {
      key: "g r",
      action: () => void navigate({ to: "/resources" }),
      description: "Go to Resources",
    },
    {
      key: "g u",
      action: () => void navigate({ to: "/clients" }),
      description: "Go to Clients",
    },
    {
      key: "g s",
      action: () => void navigate({ to: "/settings" }),
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
