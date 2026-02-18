import { useCallback, useMemo } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";

const createDraftStoreAtom = atom<Record<string, object>>({});

interface UseCreateDraftOptions<T extends object> {
  key: string;
  initialValues: T;
}

const cloneDraft = <T>(value: T): T => structuredClone(value);
const isSameDraft = <T>(left: T, right: T): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isDraftUpdater = <T>(
  value: T | ((previous: T) => T),
): value is (previous: T) => T => typeof value === "function";

const readStoredDraft = <T extends object>(
  storedDraft: unknown,
  initialValues: T,
): { draft: T; hasDraft: boolean } => {
  if (!isRecord(storedDraft)) {
    return {
      draft: cloneDraft(initialValues),
      hasDraft: false,
    };
  }

  const draft = {
    ...initialValues,
    ...storedDraft,
  };

  return {
    draft: cloneDraft(draft),
    hasDraft: !isSameDraft(draft, initialValues),
  };
};

export function useResetCreateDraft(key: string) {
  const setCreateDraftStore = useSetAtom(createDraftStoreAtom);

  return useCallback(() => {
    setCreateDraftStore((previous) => {
      if (!(key in previous)) return previous;
      const { [key]: _removedDraft, ...remainingDrafts } = previous;
      return remainingDrafts;
    });
  }, [key, setCreateDraftStore]);
}

export function useCreateDraft<T extends object>({
  key,
  initialValues,
}: UseCreateDraftOptions<T>) {
  const storedDraftByKeyAtom = useMemo(
    () =>
      selectAtom(
        createDraftStoreAtom,
        (createDraftStore) => createDraftStore[key],
      ),
    [key],
  );
  const storedDraft = useAtomValue(storedDraftByKeyAtom);
  const setCreateDraftStore = useSetAtom(createDraftStoreAtom);
  const resetDraft = useResetCreateDraft(key);

  const { draft, hasDraft } = useMemo(
    () => readStoredDraft(storedDraft, initialValues),
    [initialValues, storedDraft],
  );

  const setDraft = useCallback(
    (next: T | ((previous: T) => T)) => {
      setCreateDraftStore((previousStore) => {
        const previousDraft = readStoredDraft(
          previousStore[key],
          initialValues,
        ).draft;
        const nextDraft = isDraftUpdater(next) ? next(previousDraft) : next;

        if (isSameDraft(nextDraft, initialValues)) {
          if (!(key in previousStore)) return previousStore;
          const { [key]: _removedDraft, ...remainingDrafts } = previousStore;
          return remainingDrafts;
        }

        return {
          ...previousStore,
          [key]: cloneDraft(nextDraft),
        };
      });
    },
    [initialValues, key, setCreateDraftStore],
  );

  return {
    draft,
    setDraft,
    resetDraft,
    hasDraft,
  };
}
