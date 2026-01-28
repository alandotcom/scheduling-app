// URL-driven selection state for list/detail pages

import { useEffect } from "react";

/**
 * Hook to validate selection against available data.
 * Clears selection if the selected item no longer exists.
 */
export function useValidateSelection<T extends { id: string }>(
  items: T[] | undefined,
  selectedId: string | null,
  clearDetails: () => void,
) {
  useEffect(() => {
    if (!selectedId || !items) return;
    const exists = items.some((item) => item.id === selectedId);
    if (!exists) clearDetails();
  }, [items, selectedId, clearDetails]);
}
