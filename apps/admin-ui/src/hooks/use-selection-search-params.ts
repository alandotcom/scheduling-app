// URL-driven selection state for list/detail pages

import { useEffect } from "react";

interface UseValidateSelectionOptions<T extends { id: string }> {
  items: T[] | Set<string> | undefined;
  selectedId: string | null;
  isDataResolved: boolean;
  onInvalidSelection: () => void;
}

/**
 * Hook to validate selection against available data.
 * Clears selection if the selected item no longer exists.
 *
 * Accepts either a Set of IDs or an array of objects with id property.
 */
export function useValidateSelection<T extends { id: string }>({
  items,
  selectedId,
  isDataResolved,
  onInvalidSelection,
}: UseValidateSelectionOptions<T>) {
  useEffect(() => {
    if (!isDataResolved || !selectedId || !items) return;
    const exists =
      items instanceof Set
        ? items.has(selectedId)
        : items.some((item) => item.id === selectedId);
    if (!exists) onInvalidSelection();
  }, [items, isDataResolved, onInvalidSelection, selectedId]);
}
