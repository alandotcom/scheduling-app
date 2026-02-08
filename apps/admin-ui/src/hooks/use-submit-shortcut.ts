import { useCallback } from "react";
import {
  useKeyboardShortcuts,
  type ShortcutScope,
} from "@/hooks/use-keyboard-shortcuts";

interface UseSubmitShortcutOptions {
  onSubmit: () => void;
  enabled?: boolean;
  scope?: ShortcutScope;
}

export function useSubmitShortcut({
  onSubmit,
  enabled = true,
  scope = "modal",
}: UseSubmitShortcutOptions) {
  const handleSubmit = useCallback(() => {
    onSubmit();
  }, [onSubmit]);

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+enter", "ctrl+enter"],
        action: handleSubmit,
        ignoreInputs: false,
        description: "Submit",
      },
    ],
    enabled,
    scope,
  });
}
