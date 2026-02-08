import { useRef } from "react";

export function useClosingSnapshot<T>(entity: T | undefined): T | undefined {
  const snapshotRef = useRef<T | undefined>(undefined);
  if (entity !== undefined) {
    snapshotRef.current = entity;
  }
  return entity ?? snapshotRef.current;
}
