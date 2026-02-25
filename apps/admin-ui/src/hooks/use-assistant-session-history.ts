import { useCallback, useEffect, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import {
  buildStorageKey,
  toStorableUIMessage,
} from "./assistant-session-storage";

const HISTORY_LIMIT = 50;

/**
 * Hook to persist thread messages to sessionStorage (debounced).
 * Must be used inside an AssistantRuntimeProvider.
 *
 * Converts from assistant-ui internal format → AI SDK UIMessage format
 * before storing so that rehydration works correctly.
 */
export function useSaveSessionHistory(input: {
  orgId: string | null;
  userId: string | null;
}) {
  const { orgId, userId } = input;
  const storageKey = buildStorageKey({ orgId, userId });
  const messages = useAuiState((s) => s.thread.messages);

  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);

  // Sync ref in an effect to avoid ref writes during render
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const flushToStorage = useCallback((key: string) => {
    try {
      const trimmed = messagesRef.current.slice(-HISTORY_LIMIT);
      // Convert each MessageState → storable UIMessage before saving
      const storable = trimmed.map(toStorableUIMessage).filter(Boolean);
      sessionStorage.setItem(key, JSON.stringify(storable));
    } catch {
      // Ignore storage failures to avoid blocking chat usage.
    }
  }, []);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;

    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => flushToStorage(storageKey), 500);

    return () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    };
  }, [messages, storageKey, flushToStorage]);

  // Flush immediately on unmount
  useEffect(() => {
    return () => {
      if (writeTimerRef.current && storageKey) {
        clearTimeout(writeTimerRef.current);
        flushToStorage(storageKey);
      }
    };
  }, [storageKey, flushToStorage]);
}
