import { useCallback, useRef, useState } from "react";

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
  const [isDismissed, setIsDismissed] = useState(false);
  const prevSelectedIdRef = useRef(selectedId);

  // Reset dismissed synchronously when selection changes (no effect delay)
  if (selectedId !== prevSelectedIdRef.current) {
    prevSelectedIdRef.current = selectedId;
    if (isDismissed) setIsDismissed(false);
  }

  // Derived — always correct in the same render, no intermediate states
  const isOpen = !!selectedId && hasResolvedEntity && !isDismissed;

  const closeNow = useCallback(() => {
    setIsDismissed(true);
  }, []);

  return { isOpen, closeNow };
}
