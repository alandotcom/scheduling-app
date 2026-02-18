import { useEffect, useMemo } from "react";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";

export type CreateIntentKey =
  | "appointments"
  | "clients"
  | "calendars"
  | "appointment-types"
  | "resources"
  | "locations";

const CREATE_INTENT_DEFAULTS: Record<CreateIntentKey, boolean> = {
  appointments: false,
  clients: false,
  calendars: false,
  "appointment-types": false,
  resources: false,
  locations: false,
};

const createIntentStateAtom = atom<Record<CreateIntentKey, boolean>>(
  CREATE_INTENT_DEFAULTS,
);

const triggerCreateIntentAtom = atom(
  null,
  (_get, set, key: CreateIntentKey) => {
    set(createIntentStateAtom, (previous) => ({
      ...previous,
      [key]: true,
    }));
  },
);

const consumeCreateIntentAtom = atom(null, (get, set, key: CreateIntentKey) => {
  const current = get(createIntentStateAtom);
  if (!current[key]) return;
  set(createIntentStateAtom, {
    ...current,
    [key]: false,
  });
});

export function useTriggerCreateIntent() {
  return useSetAtom(triggerCreateIntentAtom);
}

export function useCreateIntentTrigger(
  key: CreateIntentKey,
  onCreateTrigger: () => void,
) {
  const pendingForKeyAtom = useMemo(
    () =>
      selectAtom(createIntentStateAtom, (pendingByKey) => pendingByKey[key]),
    [key],
  );
  const pendingForKey = useAtomValue(pendingForKeyAtom);
  const consumeCreateIntent = useSetAtom(consumeCreateIntentAtom);

  useEffect(() => {
    if (!pendingForKey) return;
    onCreateTrigger();
    consumeCreateIntent(key);
  }, [consumeCreateIntent, key, onCreateTrigger, pendingForKey]);
}
