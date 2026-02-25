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

// ---------- Persistence helpers ----------

const STORAGE_KEY_PREFIX = "assistant-proposals:v1";

function buildProposalStorageKey(orgId: string | null, userId: string | null) {
  if (!orgId || !userId) return null;
  return `${STORAGE_KEY_PREFIX}:${orgId}:${userId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAssistantActionResult(
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

function loadProposalResults(
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
      setRunningProposalId(proposal.proposalId);
      const m = mutationsRef.current;

      try {
        let resultMessage = "Action completed.";
        let entityId: string | undefined;

        if (proposal.actionType === "book") {
          const payload = parseProposalPayload(
            assistantBookProposalPayloadSchema,
            proposal,
          );
          const created = await m.create.mutateAsync({
            calendarId: payload.calendarId,
            appointmentTypeId: payload.appointmentTypeId,
            startTime: new Date(payload.startTime),
            timezone: payload.timezone,
            clientId: payload.clientId,
            ...(payload.notes != null ? { notes: payload.notes } : {}),
          });
          entityId = created.id;
          resultMessage = "Appointment booked.";
        } else if (proposal.actionType === "reschedule") {
          const payload = parseProposalPayload(
            assistantRescheduleProposalPayloadSchema,
            proposal,
          );
          const updated = await m.reschedule.mutateAsync({
            id: payload.appointmentId,
            newStartTime: new Date(payload.newStartTime),
            timezone: payload.timezone,
          });
          entityId = updated.id;
          resultMessage = "Appointment rescheduled.";
        } else if (proposal.actionType === "confirm") {
          const payload = parseProposalPayload(
            assistantConfirmProposalPayloadSchema,
            proposal,
          );
          const updated = await m.confirm.mutateAsync({
            id: payload.appointmentId,
          });
          entityId = updated.id;
          resultMessage = "Appointment confirmed.";
        } else if (proposal.actionType === "cancel") {
          const payload = parseProposalPayload(
            assistantCancelProposalPayloadSchema,
            proposal,
          );
          const updated = await m.cancel.mutateAsync({
            id: payload.appointmentId,
            ...(payload.reason != null ? { reason: payload.reason } : {}),
          });
          entityId = updated.id;
          resultMessage = "Appointment canceled.";
        } else if (proposal.actionType === "no_show") {
          const payload = parseProposalPayload(
            assistantNoShowProposalPayloadSchema,
            proposal,
          );
          const updated = await m.noShow.mutateAsync({
            id: payload.appointmentId,
          });
          entityId = updated.id;
          resultMessage = "Appointment marked as no-show.";
        }

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
