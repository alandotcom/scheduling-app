import { useCallback, useEffect, useReducer } from "react";

interface UseUrlDrivenModalOptions {
  selectedId: string | null;
  hasResolvedEntity: boolean;
}

interface UseUrlDrivenModalResult {
  isOpen: boolean;
  closeNow: () => void;
}

type DismissedState = {
  dismissedSelectionId: string | null;
};

type DismissedAction =
  | { type: "dismiss"; id: string }
  | { type: "clear-dismissed" };

function dismissedReducer(
  currentState: DismissedState,
  action: DismissedAction,
): DismissedState {
  if (action.type === "dismiss") {
    return { dismissedSelectionId: action.id };
  }

  if (currentState.dismissedSelectionId === null) {
    return currentState;
  }

  return { dismissedSelectionId: null };
}

export function useUrlDrivenModal({
  selectedId,
  hasResolvedEntity,
}: UseUrlDrivenModalOptions): UseUrlDrivenModalResult {
  const [{ dismissedSelectionId }, dispatchDismissed] = useReducer(
    dismissedReducer,
    { dismissedSelectionId: null },
  );
  const isDismissed =
    typeof selectedId === "string" && dismissedSelectionId === selectedId;

  // Derived — always correct in the same render, no intermediate states
  const isOpen = !!selectedId && hasResolvedEntity && !isDismissed;

  useEffect(() => {
    if (!selectedId) {
      if (dismissedSelectionId) {
        dispatchDismissed({ type: "clear-dismissed" });
      }
      return;
    }

    if (dismissedSelectionId && dismissedSelectionId !== selectedId) {
      dispatchDismissed({ type: "clear-dismissed" });
    }
  }, [dismissedSelectionId, selectedId]);

  const closeNow = useCallback(() => {
    if (!selectedId) return;
    dispatchDismissed({ type: "dismiss", id: selectedId });
  }, [selectedId]);

  return { isOpen, closeNow };
}
