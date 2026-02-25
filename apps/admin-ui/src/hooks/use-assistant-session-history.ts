import { useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useAuiState } from "@assistant-ui/react";

const HISTORY_LIMIT = 50;
const STORAGE_KEY_PREFIX = "assistant-chat:v1";

export function buildStorageKey(input: {
  orgId: string | null;
  userId: string | null;
}) {
  if (!input.orgId || !input.userId) return null;
  return `${STORAGE_KEY_PREFIX}:${input.orgId}:${input.userId}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isUIMessage(value: unknown): value is UIMessage {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.role !== "string") return false;
  return Array.isArray(value.parts);
}

// ---------------------------------------------------------------------------
// Format conversion helpers
//
// `useAuiState((s) => s.thread.messages)` returns assistant-ui internal
// `MessageState[]` which has `content` (ThreadMessage parts with
// `type: "tool-call"`) AND `parts` (PartState with `status` wrapper).
//
// `useChatRuntime({ messages })` passes UIMessages to the AI SDK's `useChat`,
// which expects parts in AI SDK format: `{ type: "tool-{name}", input, output,
// state: "output-available" }`.
//
// We convert assistant-ui → AI SDK format on save so that on reload the
// messages are in the correct shape.
// ---------------------------------------------------------------------------

/**
 * Convert a single assistant-ui part (from `content` array) to AI SDK
 * UIMessage part format.
 */
function convertPartToUIFormat(part: Record<string, unknown>): unknown {
  if (part.type === "text") {
    return { type: "text", text: part.text };
  }

  if (part.type === "tool-call" && typeof part.toolName === "string") {
    const hasResult = part.result !== undefined;
    const isError = part.isError === true;

    if (isError) {
      return {
        type: `tool-${part.toolName}`,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.args ?? {},
        state: "output-error",
        errorText:
          typeof part.result === "string"
            ? part.result
            : JSON.stringify(part.result),
      };
    }

    return {
      type: `tool-${part.toolName}`,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.args ?? {},
      state: hasResult ? "output-available" : "input-available",
      ...(hasResult && { output: part.result }),
    };
  }

  // Pass through text, reasoning, source, etc. as-is
  return part;
}

const VALID_ROLES = new Set(["user", "assistant", "system"]);

function isValidRole(role: string): role is UIMessage["role"] {
  return VALID_ROLES.has(role);
}

/**
 * Convert a MessageState (assistant-ui internal) to a storable UIMessage
 * (AI SDK format) that can be round-tripped through sessionStorage.
 */
function toStorableUIMessage(msg: unknown): UIMessage | null {
  if (!isRecord(msg)) return null;
  if (typeof msg.id !== "string" || typeof msg.role !== "string") return null;
  if (!isValidRole(msg.role)) return null;

  // Prefer `content` (ThreadMessage.content) over `parts` (PartState[])
  // because `content` has the clean data without status wrappers.
  const rawParts = Array.isArray(msg.content)
    ? msg.content
    : Array.isArray(msg.parts)
      ? msg.parts
      : null;
  if (!rawParts) return null;

  // Build parts array — the runtime validates shapes; we only need the
  // structural guarantee that `parts` is an array for `isUIMessage` to pass.
  const converted = rawParts
    .filter(isRecord)
    .map(convertPartToUIFormat)
    .filter(Boolean);

  // Construct as a plain object so the JSON round-trip produces a valid UIMessage.
  const result: UIMessage = Object.assign(Object.create(null), {
    id: msg.id,
    role: msg.role,
    parts: converted,
  });

  return result;
}

/**
 * Check if session history exists (lightweight, no full validation).
 */
export function hasSessionHistory(input: {
  orgId: string | null;
  userId: string | null;
}): boolean {
  const storageKey = buildStorageKey(input);
  if (!storageKey || typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

/**
 * Clear session history from sessionStorage (e.g. on "New chat").
 */
export function clearSessionHistory(input: {
  orgId: string | null;
  userId: string | null;
}) {
  const storageKey = buildStorageKey(input);
  if (!storageKey || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore
  }
}

/**
 * Synchronously load session history from sessionStorage.
 * Returns the stored UIMessages or undefined if none found.
 */
export function loadSessionHistory(input: {
  orgId: string | null;
  userId: string | null;
}): UIMessage[] | undefined {
  const storageKey = buildStorageKey(input);
  if (!storageKey || typeof window === "undefined") return undefined;

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    if (!parsed.every(isUIMessage)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

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
