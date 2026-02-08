import { useCallback, useEffect, useState } from "react";

interface UseUrlDrivenModalOptions {
  selectedId: string | null;
  hasResolvedEntity: boolean;
}

interface UseUrlDrivenModalResult {
  isOpen: boolean;
  closeNow: () => void;
}

export function useUrlDrivenModal({
  selectedId,
  hasResolvedEntity,
}: UseUrlDrivenModalOptions): UseUrlDrivenModalResult {
  const [dismissedSelectionId, setDismissedSelectionId] = useState<
    string | null
  >(null);
  const isDismissed =
    typeof selectedId === "string" && dismissedSelectionId === selectedId;

  // Derived — always correct in the same render, no intermediate states
  const isOpen = !!selectedId && hasResolvedEntity && !isDismissed;

  useEffect(() => {
    if (!selectedId) {
      if (dismissedSelectionId) setDismissedSelectionId(null);
      return;
    }

    if (dismissedSelectionId && dismissedSelectionId !== selectedId) {
      setDismissedSelectionId(null);
    }
  }, [dismissedSelectionId, selectedId]);

  const closeNow = useCallback(() => {
    if (!selectedId) return;
    setDismissedSelectionId(selectedId);
  }, [selectedId]);

  return { isOpen, closeNow };
}
