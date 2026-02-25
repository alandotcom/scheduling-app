import { useCallback } from "react";
import { useAui, useAuiState } from "@assistant-ui/react";

/**
 * Wraps assistant-ui's thread().append() with a simple `select(text)` helper.
 * Also exposes `isRunning` to disable clicks while the AI is streaming.
 */
export function useAppendSelection() {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const select = useCallback(
    (text: string) => {
      aui.thread().append({
        role: "user",
        content: [{ type: "text", text }],
      });
    },
    [aui],
  );

  return { select, isRunning };
}
