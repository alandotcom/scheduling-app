// URL-driven selection state for list/detail pages
// Provides consistent search param management across all list views

import { useEffect } from "react";

export type DetailTabValue =
  | "details"
  | "availability"
  | "appointments"
  | "calendars"
  | "resources"
  | "history";
export type ViewMode = "list" | "schedule";

export interface SelectionSearchParams {
  selected?: string;
  tab?: DetailTabValue;
  view?: ViewMode;
  date?: string;
}

export const isDetailTab = (value: string): value is DetailTabValue =>
  [
    "details",
    "availability",
    "appointments",
    "calendars",
    "resources",
    "history",
  ].includes(value);

export const isViewMode = (value: string): value is ViewMode =>
  value === "list" || value === "schedule";

/**
 * Validate search params for list pages with selection support.
 * Use this in route's validateSearch function.
 */
export function validateSelectionSearch(
  search: Record<string, unknown>,
  options?: {
    allowedTabs?: DetailTabValue[];
    allowView?: boolean;
    allowDate?: boolean;
  },
): SelectionSearchParams {
  const { allowedTabs, allowView = false, allowDate = false } = options ?? {};

  const selected =
    typeof search.selected === "string" ? search.selected : undefined;

  let tab: DetailTabValue | undefined;
  if (typeof search.tab === "string" && isDetailTab(search.tab)) {
    if (!allowedTabs || allowedTabs.includes(search.tab)) {
      tab = search.tab;
    }
  }

  let view: ViewMode | undefined;
  if (allowView && typeof search.view === "string" && isViewMode(search.view)) {
    view = search.view;
  }

  let date: string | undefined;
  if (
    allowDate &&
    typeof search.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(search.date)
  ) {
    date = search.date;
  }

  return { selected, tab, view, date };
}

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
