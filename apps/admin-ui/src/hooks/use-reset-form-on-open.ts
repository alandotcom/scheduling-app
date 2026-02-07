import { useEffect, useRef } from "react";

interface UseResetFormOnOpenOptions<TValues> {
  open: boolean;
  entityKey: string | null | undefined;
  values: TValues | null;
  reset: (values: TValues) => void;
  onReset?: () => void;
}

// Reset form state when a detail surface opens or selected entity changes.
export function useResetFormOnOpen<TValues>({
  open,
  entityKey,
  values,
  reset,
  onReset,
}: UseResetFormOnOpenOptions<TValues>) {
  const wasOpenRef = useRef(false);
  const lastEntityKeyRef = useRef<string | null | undefined>(entityKey);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const changedWhileOpen =
      open && wasOpenRef.current && entityKey !== lastEntityKeyRef.current;

    if (values && (justOpened || changedWhileOpen)) {
      reset(values);
      onReset?.();
    }

    wasOpenRef.current = open;
    lastEntityKeyRef.current = entityKey;
  }, [entityKey, onReset, open, reset, values]);
}
