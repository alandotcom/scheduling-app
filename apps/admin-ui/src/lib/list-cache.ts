// Helpers for writing a freshly-created entity into list query caches from a
// mutation response (TanStack Query's "updates from mutation responses"
// pattern: setQueryData in onSuccess with the real object the server returned).
//
// This is NOT an optimistic update — it runs after the create succeeds, using
// confirmed server data, so there is no rollback. Its purpose is to make the
// new row resolvable in the same render the create form closes, so a URL-driven
// detail modal can morph open without an async-refetch gap.

import type { QueryClient } from "@tanstack/react-query";

interface ListCacheShape<T extends { id: string }> {
  items: T[];
}

/**
 * Prepend `item` to a cached `{ items: [...] }` list response, skipping if an
 * entry with the same id already exists. Returns the cache value unchanged when
 * there is no cache yet.
 */
function prependToListCache<T extends { id: string }>(
  old: ListCacheShape<T> | undefined,
  item: T,
): ListCacheShape<T> | undefined {
  if (!old) return old;
  if (old.items.some((existing) => existing.id === item.id)) return old;
  return { ...old, items: [item, ...old.items] };
}

/**
 * Write a created entity (from a mutation response) into every cached list
 * query under `listQueryKey`, so list-backed selectors (e.g. `items.find(byId)`)
 * resolve it immediately.
 */
export function addCreatedToListCache<T extends { id: string }>(
  queryClient: QueryClient,
  listQueryKey: readonly unknown[],
  item: T,
): void {
  queryClient.setQueriesData<ListCacheShape<T>>(
    { queryKey: listQueryKey },
    (old) => prependToListCache(old, item),
  );
}
