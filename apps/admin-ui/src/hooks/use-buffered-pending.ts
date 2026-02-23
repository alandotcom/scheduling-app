import { useEffect, useRef, useState } from "react";

interface BufferedPendingOptions {
  delayMs?: number;
  minVisibleMs?: number;
}

const DEFAULT_DELAY_MS = 150;
const DEFAULT_MIN_VISIBLE_MS = 300;

export function useBufferedPending(
  pending: boolean,
  options?: BufferedPendingOptions,
): boolean {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const minVisibleMs = options?.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS;
  const [showPendingVisual, setShowPendingVisual] = useState(false);
  const operationIdRef = useRef(0);
  const shownAtMsRef = useRef<number | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (pending) {
      const operationId = ++operationIdRef.current;
      clearHideTimer();

      if (showPendingVisual) {
        return;
      }

      clearShowTimer();
      showTimerRef.current = setTimeout(() => {
        if (operationId !== operationIdRef.current) {
          return;
        }
        shownAtMsRef.current = Date.now();
        setShowPendingVisual(true);
      }, delayMs);
      return;
    }

    operationIdRef.current += 1;
    clearShowTimer();

    if (!showPendingVisual) {
      shownAtMsRef.current = null;
      clearHideTimer();
      return;
    }

    const shownAtMs = shownAtMsRef.current ?? Date.now();
    const elapsedMs = Date.now() - shownAtMs;
    const remainingMs = Math.max(0, minVisibleMs - elapsedMs);

    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      shownAtMsRef.current = null;
      setShowPendingVisual(false);
    }, remainingMs);
  }, [delayMs, minVisibleMs, pending, showPendingVisual]);

  useEffect(() => {
    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, []);

  return showPendingVisual;
}
