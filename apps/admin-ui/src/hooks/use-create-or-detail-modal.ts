import { useCallback } from "react";

interface UseCreateOrDetailModalOptions {
  /** Local create-form state (the modal is showing the create form). */
  isCreating: boolean;
  /** Detail intent already resolved to an entity (e.g. `urlOpen && !!entity`). */
  detailOpen: boolean;
  onCloseCreate: () => void;
  onCloseDetail: () => void;
}

interface UseCreateOrDetailModalResult {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Drives a single modal that morphs between a create form and an entity detail
 * view. `open` stays true across the create→detail handoff (when `isCreating`
 * flips false in the same render `detailOpen` becomes true), so the underlying
 * Dialog fires no exit/enter animation — only the modal's content swaps. This
 * is the invariant that prevents the create→detail flicker; keeping it in one
 * place means a route can't silently break it for the others.
 */
export function useCreateOrDetailModal({
  isCreating,
  detailOpen,
  onCloseCreate,
  onCloseDetail,
}: UseCreateOrDetailModalOptions): UseCreateOrDetailModalResult {
  const onOpenChange = useCallback(
    (next: boolean) => {
      if (next) return;
      if (isCreating) onCloseCreate();
      else onCloseDetail();
    },
    [isCreating, onCloseCreate, onCloseDetail],
  );

  return { open: isCreating || detailOpen, onOpenChange };
}
