import { atom, useAtomValue, useSetAtom } from "jotai";

export type CommandCenterMode = "commands" | "assistant";

const commandCenterOpenAtom = atom(false);
const commandCenterModeAtom = atom<CommandCenterMode>("commands");

const openCommandCenterAtom = atom(
  null,
  (_get, set, mode: CommandCenterMode = "commands") => {
    set(commandCenterModeAtom, mode);
    set(commandCenterOpenAtom, true);
  },
);

const setCommandCenterModeAtom = atom(
  null,
  (_get, set, mode: CommandCenterMode) => {
    set(commandCenterModeAtom, mode);
  },
);

const setCommandCenterOpenAtom = atom(null, (_get, set, open: boolean) => {
  set(commandCenterOpenAtom, open);
});

export function useCommandCenterState() {
  return {
    open: useAtomValue(commandCenterOpenAtom),
    mode: useAtomValue(commandCenterModeAtom),
  };
}

export function useOpenCommandCenter() {
  return useSetAtom(openCommandCenterAtom);
}

export function useSetCommandCenterMode() {
  return useSetAtom(setCommandCenterModeAtom);
}

export function useSetCommandCenterOpen() {
  return useSetAtom(setCommandCenterOpenAtom);
}
