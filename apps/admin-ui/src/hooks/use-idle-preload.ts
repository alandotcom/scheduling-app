import { useEffect } from "react";

/**
 * Warm a dynamically-imported chunk during browser idle time so its first use
 * (opening a modal, switching to a heavy view) is instant. This keeps the chunk
 * off the critical initial-load path while avoiding a cold-load delay later.
 *
 * Pass a module-scope `load` function (stable reference) to avoid re-running.
 */
export function useIdlePreload(load: () => Promise<unknown>, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return () => {};
    }

    let cancelled = false;
    const run = () => {
      if (!cancelled) {
        void load();
      }
    };

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 2000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }

    const id = setTimeout(run, 1500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [load, enabled]);
}
