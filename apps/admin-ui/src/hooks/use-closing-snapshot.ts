import { useEffect, useState } from "react";

export function useClosingSnapshot<T>(entity: T | undefined): T | undefined {
  const [snapshot, setSnapshot] = useState<T | undefined>(entity);

  useEffect(() => {
    if (entity === undefined) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setSnapshot((previousSnapshot) => {
        if (Object.is(previousSnapshot, entity)) {
          return previousSnapshot;
        }
        return entity;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [entity]);

  return entity ?? snapshot;
}
