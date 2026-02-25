import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAui } from "@assistant-ui/react";
import type {
  AssistantActionProposal,
  AssistantActionResult,
} from "@scheduling/dto";
import {
  assistantBookProposalPayloadSchema,
  assistantCancelProposalPayloadSchema,
  assistantConfirmProposalPayloadSchema,
  assistantNoShowProposalPayloadSchema,
  assistantRescheduleProposalPayloadSchema,
} from "@scheduling/dto";
import type { z } from "zod";
import { orpc } from "@/lib/query";
import { authClient } from "@/lib/auth-client";
import { isRecord } from "@/hooks/assistant-session-storage";

// ---------- Persistence helpers ----------

const STORAGE_KEY_PREFIX = "assistant-proposals:v1";

export function buildProposalStorageKey(
  orgId: string | null,
  userId: string | null,
) {
  if (!orgId || !userId) return null;
  return `${STORAGE_KEY_PREFIX}:${orgId}:${userId}`;
}

export function isAssistantActionResult(
  value: unknown,
): value is AssistantActionResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.proposalId === "string" &&
    typeof value.actionType === "string" &&
    typeof value.success === "boolean" &&
    typeof value.message === "string"
  );
}

export function loadProposalResults(
  orgId: string | null,
  userId: string | null,
): Record<string, AssistantActionResult> {
  const key = buildProposalStorageKey(orgId, userId);
  if (!key) return {};
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: Record<string, AssistantActionResult> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isAssistantActionResult(v)) result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

function saveProposalResults(
  orgId: string | null,
  userId: string | null,
  results: Record<string, AssistantActionResult>,
) {
  const key = buildProposalStorageKey(orgId, userId);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(results));
  } catch {
    // Ignore storage failures
  }
}

/**
 * Clear persisted proposal results from sessionStorage (e.g. on "New chat").
 */
export function clearProposalResults(input: {
  orgId: string | null;
  userId: string | null;
}) {
  const key = buildProposalStorageKey(input.orgId, input.userId);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures
  }
}

// ---------- Helpers ----------

function parseProposalPayload<T>(
  schema: z.ZodType<T>,
  proposal: AssistantActionProposal,
): T {
  const parsed = schema.safeParse(proposal.payload);
  if (!parsed.success) {
    throw new Error(`Invalid ${proposal.actionType} proposal payload.`);
  }
  return parsed.data;
}

const PROPOSAL_MESSAGES: Record<AssistantActionProposal["actionType"], string> =
  {
    book: "Appointment booked.",
    reschedule: "Appointment rescheduled.",
    confirm: "Appointment confirmed.",
    cancel: "Appointment canceled.",
    no_show: "Appointment marked as no-show.",
  };

interface ProposalContextValue {
  runningProposalId: string | null;
  proposalResults: Record<string, AssistantActionResult>;
  onConfirmProposal: (proposal: AssistantActionProposal) => void;
  onDeclineProposal: (proposal: AssistantActionProposal) => void;
}

const ProposalContext = createContext<ProposalContextValue | null>(null);

export function useProposalContext() {
  const ctx = useContext(ProposalContext);
  if (!ctx)
    throw new Error("useProposalContext must be used within ProposalProvider");
  return ctx;
}

export function ProposalProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const aui = useAui();
  const { data: session } = authClient.useSession();
  const orgId = session?.session.activeOrganizationId ?? null;
  const userId = session?.user.id ?? null;

  const [runningProposalId, setRunningProposalId] = useState<string | null>(
    null,
  );
  // Ref-based guard to prevent double-execution from rapid clicks.
  // React state updates are async, so `runningProposalId` may not be set
  // before a second click fires.
  const executingRef = useRef<string | null>(null);
  const [proposalResults, setProposalResults] = useState<
    Record<string, AssistantActionResult>
  >(() => loadProposalResults(orgId, userId));

  // Reload persisted results when org/user changes
  useEffect(() => {
    setProposalResults(loadProposalResults(orgId, userId));
  }, [orgId, userId]);

  // Persist results whenever they change
  useEffect(() => {
    saveProposalResults(orgId, userId, proposalResults);
  }, [orgId, userId, proposalResults]);

  const createMutation = useMutation(
    orpc.appointments.create.mutationOptions(),
  );
  const rescheduleMutation = useMutation(
    orpc.appointments.reschedule.mutationOptions(),
  );
  const confirmMutation = useMutation(
    orpc.appointments.confirm.mutationOptions(),
  );
  const cancelMutation = useMutation(
    orpc.appointments.cancel.mutationOptions(),
  );
  const noShowMutation = useMutation(
    orpc.appointments.noShow.mutationOptions(),
  );

  // Use refs for mutations so the callback doesn't re-create on every render
  const mutationsRef = useRef({
    create: createMutation,
    reschedule: rescheduleMutation,
    confirm: confirmMutation,
    cancel: cancelMutation,
    noShow: noShowMutation,
  });
  mutationsRef.current = {
    create: createMutation,
    reschedule: rescheduleMutation,
    confirm: confirmMutation,
    cancel: cancelMutation,
    noShow: noShowMutation,
  };

  const invalidateSchedulingQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.appointments.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.clients.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.calendars.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.appointmentTypes.key() }),
    ]);
  }, [queryClient]);

  const onConfirmProposal = useCallback(
    async (proposal: AssistantActionProposal) => {
      // Ref-based guard: prevent double-execution from rapid clicks
      if (executingRef.current === proposal.proposalId) return;
      executingRef.current = proposal.proposalId;
      setRunningProposalId(proposal.proposalId);
      const m = mutationsRef.current;

      try {
        const handlers: Record<
          AssistantActionProposal["actionType"],
          () => Promise<{ id: string }>
        > = {
          book: async () => {
            const p = parseProposalPayload(
              assistantBookProposalPayloadSchema,
              proposal,
            );
            return m.create.mutateAsync({
              calendarId: p.calendarId,
              appointmentTypeId: p.appointmentTypeId,
              startTime: new Date(p.startTime),
              timezone: p.timezone,
              clientId: p.clientId,
              ...(p.notes != null ? { notes: p.notes } : {}),
            });
          },
          reschedule: async () => {
            const p = parseProposalPayload(
              assistantRescheduleProposalPayloadSchema,
              proposal,
            );
            return m.reschedule.mutateAsync({
              id: p.appointmentId,
              newStartTime: new Date(p.newStartTime),
              timezone: p.timezone,
            });
          },
          confirm: async () => {
            const p = parseProposalPayload(
              assistantConfirmProposalPayloadSchema,
              proposal,
            );
            return m.confirm.mutateAsync({ id: p.appointmentId });
          },
          cancel: async () => {
            const p = parseProposalPayload(
              assistantCancelProposalPayloadSchema,
              proposal,
            );
            return m.cancel.mutateAsync({
              id: p.appointmentId,
              ...(p.reason != null ? { reason: p.reason } : {}),
            });
          },
          no_show: async () => {
            const p = parseProposalPayload(
              assistantNoShowProposalPayloadSchema,
              proposal,
            );
            return m.noShow.mutateAsync({ id: p.appointmentId });
          },
        };

        const { id: entityId } = await handlers[proposal.actionType]();
        const resultMessage = PROPOSAL_MESSAGES[proposal.actionType];

        await invalidateSchedulingQueries();

        setProposalResults((previous) => ({
          ...previous,
          [proposal.proposalId]: {
            proposalId: proposal.proposalId,
            actionType: proposal.actionType,
            success: true,
            message: resultMessage,
            ...(entityId ? { entityId } : {}),
          },
        }));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Action failed. Please review details and try again.";
        setProposalResults((previous) => ({
          ...previous,
          [proposal.proposalId]: {
            proposalId: proposal.proposalId,
            actionType: proposal.actionType,
            success: false,
            message,
          },
        }));
      } finally {
        executingRef.current = null;
        setRunningProposalId(null);
      }
    },
    [invalidateSchedulingQueries],
  );

  const auiRef = useRef(aui);
  auiRef.current = aui;

  const onDeclineProposal = useCallback((proposal: AssistantActionProposal) => {
    setProposalResults((previous) => ({
      ...previous,
      [proposal.proposalId]: {
        proposalId: proposal.proposalId,
        actionType: proposal.actionType,
        success: false,
        message: "Declined by user.",
      },
    }));

    // Notify the AI so it can offer alternatives
    auiRef.current.thread().append({
      role: "user",
      content: [{ type: "text", text: "I declined this proposal." }],
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      runningProposalId,
      proposalResults,
      onConfirmProposal,
      onDeclineProposal,
    }),
    [runningProposalId, proposalResults, onConfirmProposal, onDeclineProposal],
  );

  return (
    <ProposalContext.Provider value={contextValue}>
      {children}
    </ProposalContext.Provider>
  );
}
