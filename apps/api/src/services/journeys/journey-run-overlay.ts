import {
  type JourneyRun,
  type JourneyRunDelivery,
  type JourneyRunEvent,
  type JourneyRunListItem,
  type JourneyRunStepLog,
  type JourneyRunTriggerContext,
} from "@scheduling/dto";
import {
  appointments,
  clients,
  journeyDeliveries,
  journeyRunEvents,
  journeyRunStepLogs,
  journeyRuns,
  journeyVersions,
} from "@scheduling/db/schema";
import { compact, uniq } from "es-toolkit/array";
import { and, desc, eq, inArray } from "drizzle-orm";
import { type DbClient } from "../../lib/db.js";
import { isRecord } from "../../lib/type-guards.js";

// Presentation layer for journey runs: maps DB rows to the run/run-list/run-detail
// DTOs the admin overlay reads, and assembles the run-list sidebar summary
// (subject, next state, status reason, channel hint, trigger event type) from the
// runs plus their deliveries, step logs, and run events. Pure read-model shaping;
// no writes, no transaction management.

function getJourneyVersionFromSnapshot(
  snapshot: Record<string, unknown>,
): number | null {
  const value = snapshot["version"];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function toJourneyRun(row: typeof journeyRuns.$inferSelect): JourneyRun {
  return {
    id: row.id,
    journeyVersionId: row.journeyVersionId,
    appointmentId: row.appointmentId,
    mode: row.mode,
    status: row.status,
    journeyNameSnapshot: row.journeyNameSnapshot,
    journeyVersion: getJourneyVersionFromSnapshot(row.journeyVersionSnapshot),
    journeyDeleted: row.journeyVersionId === null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
  };
}

function formatPersonName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const parts = [firstName?.trim(), lastName?.trim()].filter(
    (value): value is string => Boolean(value && value.length > 0),
  );

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" ");
}

function formatAppointmentDateTime(startAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(startAt);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(startAt);
  }
}

function toReasonCodeLabel(reasonCode: string | null): string | null {
  if (!reasonCode) {
    return null;
  }

  if (reasonCode === "past_due") {
    return "Skipped because scheduled time already passed";
  }

  if (reasonCode === "manual_cancel") {
    return "Canceled manually";
  }

  if (reasonCode === "journey_paused") {
    return "Canceled because journey paused";
  }

  if (reasonCode === "journey_draft") {
    return "Canceled because journey was unpublished";
  }

  if (reasonCode === "appointment_canceled") {
    return "Appointment canceled";
  }

  if (reasonCode === "appointment_confirmed") {
    return "Appointment confirmed";
  }

  if (reasonCode === "wait_for_confirmation_timeout") {
    return "Wait for confirmation timed out";
  }

  if (reasonCode === "confirmation_not_required") {
    return "Confirmation not required";
  }

  if (reasonCode === "delivery_missing") {
    return "Delivery missing";
  }

  if (reasonCode.startsWith("provider_error:")) {
    return "Provider error";
  }

  return reasonCode.replaceAll("_", " ");
}

function toChannelLabel(channel: string | null): string | null {
  if (!channel) {
    return null;
  }

  const normalized = channel.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (normalized === "sms") {
    return "SMS";
  }

  return normalized
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toNodeTypeLabel(nodeType: string): string {
  switch (nodeType.trim().toLowerCase()) {
    case "trigger":
      return "Trigger";
    case "wait":
      return "Wait";
    case "wait-for-confirmation":
      return "Wait for confirmation";
    case "condition":
      return "If / else";
    case "logger":
      return "Logger";
    case "send-resend":
    case "email":
      return "Send email";
    case "send-resend-template":
      return "Send email template";
    case "send-slack":
    case "slack":
      return "Send Slack message";
    case "send-twilio":
    case "sms":
      return "Send SMS";
    default:
      return nodeType.replaceAll("-", " ");
  }
}

function getChannelFromNodeType(nodeType: string): string | null {
  const normalized = nodeType.trim().toLowerCase();
  if (normalized === "send-resend" || normalized === "send-resend-template") {
    return "email";
  }

  if (normalized === "send-slack" || normalized === "slack") {
    return "slack";
  }

  if (normalized === "send-twilio" || normalized === "sms") {
    return "sms";
  }

  return null;
}

function resolveWaitUntilFromStepLog(row: {
  output: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
}): Date | null {
  const candidates = [
    row.output?.["waitUntil"],
    row.output?.["wait_until"],
    row.input?.["waitUntil"],
    row.input?.["wait_until"],
  ];

  for (const candidate of candidates) {
    const candidateDate =
      candidate instanceof Date
        ? candidate
        : typeof candidate === "string"
          ? new Date(candidate)
          : null;
    if (candidateDate && !Number.isNaN(candidateDate.getTime())) {
      return candidateDate;
    }
  }

  return null;
}

function truncateSingleLine(value: string, maxLength = 120): string {
  const singleLine = value.replaceAll(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }

  return `${singleLine.slice(0, maxLength - 1)}…`;
}

function resolveTriggerEventTypeFromEventMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) {
    return null;
  }

  const eventType = metadata["eventType"];
  if (typeof eventType !== "string" || eventType.trim().length === 0) {
    return null;
  }

  return eventType.trim();
}

function resolveTriggerEventTypeFromStepLogs(input: {
  stepLogs: Array<{
    nodeType: string;
    input: Record<string, unknown> | null;
  }>;
}): string | null {
  const triggerStepLog = input.stepLogs.find(
    (stepLog) => stepLog.nodeType.trim().toLowerCase() === "trigger",
  );

  if (!triggerStepLog?.input) {
    return null;
  }

  const eventType = triggerStepLog.input["eventType"];
  if (typeof eventType !== "string" || eventType.trim().length === 0) {
    return null;
  }

  return eventType.trim();
}

function toTriggerEventTypeFromCanceledReason(
  reasonCode: string | null,
): string | null {
  if (reasonCode === "appointment_canceled") {
    return "appointment.canceled";
  }

  if (reasonCode === "appointment_confirmed") {
    return "appointment.confirmed";
  }

  return null;
}

function resolveRunSubject(input: {
  run: typeof journeyRuns.$inferSelect;
  appointmentById: Map<
    string,
    {
      id: string;
      startAt: Date;
      timezone: string;
      status: string;
      clientId: string | null;
      clientFirstName: string | null;
      clientLastName: string | null;
      clientEmail: string | null;
    }
  >;
  clientById: Map<
    string,
    {
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
    }
  >;
}): JourneyRunListItem["sidebarSummary"]["subject"] {
  const appointment =
    input.run.appointmentId &&
    input.appointmentById.get(input.run.appointmentId);
  if (appointment) {
    const appointmentLabel = formatAppointmentDateTime(
      appointment.startAt,
      appointment.timezone,
    );
    const clientName = formatPersonName(
      appointment.clientFirstName,
      appointment.clientLastName,
    );

    if (clientName) {
      return {
        type: "client",
        primary: clientName,
        secondary: appointmentLabel,
      };
    }

    return {
      type: "appointment",
      primary: appointmentLabel,
      secondary: appointment.status,
    };
  }

  const client = input.run.clientId && input.clientById.get(input.run.clientId);
  if (client) {
    const clientName = formatPersonName(client.firstName, client.lastName);
    if (clientName) {
      return {
        type: "client",
        primary: clientName,
        secondary: client.email,
      };
    }

    return {
      type: "client",
      primary: client.email,
      secondary: null,
    };
  }

  return {
    type: "unknown",
    primary: null,
    secondary: null,
  };
}

function resolveRunNextState(input: {
  run: typeof journeyRuns.$inferSelect;
  deliveries: Array<{
    journeyRunId: string;
    status: typeof journeyDeliveries.$inferSelect.status;
    scheduledFor: Date;
    channel: string;
    createdAt: Date;
  }>;
  stepLogs: Array<{
    journeyRunId: string;
    nodeType: string;
    status: typeof journeyRunStepLogs.$inferSelect.status;
    output: Record<string, unknown> | null;
    input: Record<string, unknown> | null;
    startedAt: Date;
  }>;
}): JourneyRunListItem["sidebarSummary"]["nextState"] {
  if (input.run.status !== "planned" && input.run.status !== "running") {
    return null;
  }

  const runningWaitStep = input.stepLogs.find((stepLog) => {
    if (stepLog.status !== "running") {
      return false;
    }

    const nodeType = stepLog.nodeType.trim().toLowerCase();
    return nodeType === "wait" || nodeType === "wait-for-confirmation";
  });

  if (runningWaitStep) {
    const waitUntil = resolveWaitUntilFromStepLog(runningWaitStep);
    if (waitUntil) {
      return {
        label: "Waiting until",
        at: waitUntil,
        channel: null,
      };
    }

    return {
      label: "Waiting",
      at: null,
      channel: null,
    };
  }

  const plannedDeliveries = input.deliveries.filter(
    (delivery) => delivery.status === "planned",
  );
  if (plannedDeliveries.length > 0) {
    const nextDelivery = plannedDeliveries.reduce((earliest, current) =>
      current.scheduledFor.getTime() < earliest.scheduledFor.getTime()
        ? current
        : earliest,
    );
    const channelLabel = toChannelLabel(nextDelivery.channel);
    return {
      label: channelLabel ? `Next ${channelLabel}` : "Next delivery",
      at: nextDelivery.scheduledFor,
      channel: nextDelivery.channel,
    };
  }

  const runningStep = input.stepLogs.find(
    (stepLog) => stepLog.status === "running",
  );
  if (runningStep) {
    return {
      label: `Running ${toNodeTypeLabel(runningStep.nodeType)}`,
      at: runningStep.startedAt,
      channel: getChannelFromNodeType(runningStep.nodeType),
    };
  }

  return null;
}

function resolveRunStatusReason(input: {
  run: typeof journeyRuns.$inferSelect;
  deliveries: Array<{
    status: typeof journeyDeliveries.$inferSelect.status;
    reasonCode: string | null;
    createdAt: Date;
  }>;
  stepLogs: Array<{
    status: typeof journeyRunStepLogs.$inferSelect.status;
    error: string | null;
    startedAt: Date;
  }>;
  canceledReasonCode: string | null;
}): string | null {
  if (input.run.status !== "failed" && input.run.status !== "canceled") {
    return null;
  }

  if (input.run.status === "failed") {
    const latestErrorLog = input.stepLogs.find(
      (stepLog) =>
        stepLog.status === "error" &&
        typeof stepLog.error === "string" &&
        stepLog.error.trim().length > 0,
    );
    if (latestErrorLog?.error) {
      return truncateSingleLine(latestErrorLog.error);
    }
  }

  const relevantDeliveryStatuses =
    input.run.status === "failed"
      ? new Set<typeof journeyDeliveries.$inferSelect.status>([
          "failed",
          "skipped",
          "canceled",
        ])
      : new Set<typeof journeyDeliveries.$inferSelect.status>([
          "canceled",
          "skipped",
        ]);

  const latestReasonDelivery = input.deliveries.find(
    (delivery) =>
      relevantDeliveryStatuses.has(delivery.status) &&
      Boolean(delivery.reasonCode),
  );
  if (latestReasonDelivery?.reasonCode) {
    return toReasonCodeLabel(latestReasonDelivery.reasonCode);
  }

  if (input.run.status === "canceled") {
    return toReasonCodeLabel(input.canceledReasonCode);
  }

  return null;
}

function resolveChannelHint(input: {
  deliveries: Array<{
    status: typeof journeyDeliveries.$inferSelect.status;
    channel: string;
  }>;
  stepLogs: Array<{
    status: typeof journeyRunStepLogs.$inferSelect.status;
    nodeType: string;
  }>;
  nextState: JourneyRunListItem["sidebarSummary"]["nextState"];
}): string | null {
  if (input.nextState?.channel) {
    return input.nextState.channel;
  }

  const latestDelivery = input.deliveries[0];
  if (latestDelivery?.channel) {
    return latestDelivery.channel;
  }

  const runningStep = input.stepLogs.find(
    (stepLog) => stepLog.status === "running",
  );
  if (!runningStep) {
    return null;
  }

  return getChannelFromNodeType(runningStep.nodeType);
}

export function toJourneyRunDelivery(
  row: typeof journeyDeliveries.$inferSelect,
): JourneyRunDelivery {
  return {
    id: row.id,
    journeyRunId: row.journeyRunId,
    stepKey: row.stepKey,
    channel: row.channel,
    scheduledFor: row.scheduledFor,
    status: row.status,
    reasonCode: row.reasonCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toJourneyRunEvent(
  row: typeof journeyRunEvents.$inferSelect,
): JourneyRunEvent {
  return {
    id: row.id,
    journeyRunId: row.journeyRunId,
    eventType: row.eventType,
    message: row.message,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

export function toJourneyRunStepLog(
  row: typeof journeyRunStepLogs.$inferSelect,
): JourneyRunStepLog {
  return {
    id: row.id,
    journeyRunId: row.journeyRunId,
    stepKey: row.stepKey,
    nodeType: row.nodeType,
    status: row.status,
    input: row.input ?? null,
    output: row.output ?? null,
    error: row.error ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function resolveTriggerEventType(input: {
  events: Array<typeof journeyRunEvents.$inferSelect>;
  stepLogs: Array<typeof journeyRunStepLogs.$inferSelect>;
}): string | null {
  const runCreatedEvent = input.events.find(
    (event) => event.eventType === "run_created",
  );

  if (runCreatedEvent && isRecord(runCreatedEvent.metadata)) {
    const eventType = runCreatedEvent.metadata["eventType"];
    if (typeof eventType === "string" && eventType.trim().length > 0) {
      return eventType.trim();
    }
  }

  const triggerStepLog = input.stepLogs.find(
    (stepLog) => stepLog.nodeType === "trigger",
  );
  if (!triggerStepLog || !isRecord(triggerStepLog.input)) {
    return null;
  }

  const eventType = triggerStepLog.input["eventType"];
  if (typeof eventType !== "string" || eventType.trim().length === 0) {
    return null;
  }

  return eventType.trim();
}

export function resolveTriggerPayload(input: {
  events: Array<typeof journeyRunEvents.$inferSelect>;
  stepLogs: Array<typeof journeyRunStepLogs.$inferSelect>;
}): Record<string, unknown> | null {
  const triggerStepLog = input.stepLogs.find(
    (stepLog) => stepLog.nodeType === "trigger",
  );
  if (triggerStepLog && isRecord(triggerStepLog.input)) {
    return triggerStepLog.input;
  }

  const runCreatedEvent = input.events.find(
    (event) => event.eventType === "run_created",
  );
  if (runCreatedEvent && isRecord(runCreatedEvent.metadata)) {
    return runCreatedEvent.metadata;
  }

  return null;
}

export function toJourneyRunTriggerContext(input: {
  eventType: string | null;
  payload: Record<string, unknown> | null;
  appointment: {
    id: string;
    calendarId: string;
    appointmentTypeId: string;
    clientId: string | null;
    startAt: Date;
    endAt: Date;
    timezone: string;
    status: string;
    notes: string | null;
  } | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
}): JourneyRunTriggerContext | null {
  if (
    !input.eventType &&
    !input.payload &&
    !input.appointment &&
    !input.client
  ) {
    return null;
  }

  return {
    eventType: input.eventType,
    payload: input.payload,
    appointment: input.appointment,
    client: input.client,
  };
}

export async function getJourneyIdByVersionIdMap(
  tx: DbClient,
  journeyVersionIds: string[],
): Promise<Map<string, string>> {
  if (journeyVersionIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({
      id: journeyVersions.id,
      journeyId: journeyVersions.journeyId,
    })
    .from(journeyVersions)
    .where(inArray(journeyVersions.id, journeyVersionIds));

  return new Map(rows.map((row) => [row.id, row.journeyId] as const));
}

export async function buildJourneyRunListItems(input: {
  tx: DbClient;
  runs: Array<typeof journeyRuns.$inferSelect>;
  resolveJourneyId: (run: typeof journeyRuns.$inferSelect) => string | null;
}): Promise<JourneyRunListItem[]> {
  const { tx, runs, resolveJourneyId } = input;
  if (runs.length === 0) {
    return [];
  }

  const runIds = runs.map((row) => row.id);
  const appointmentIds = compact(uniq(runs.map((row) => row.appointmentId)));
  const clientIds = compact(uniq(runs.map((row) => row.clientId)));

  const [appointmentRows, clientRows, runEventRows, deliveryRows, stepLogRows] =
    await Promise.all([
      appointmentIds.length > 0
        ? tx
            .select({
              id: appointments.id,
              startAt: appointments.startAt,
              timezone: appointments.timezone,
              status: appointments.status,
              clientId: appointments.clientId,
              clientFirstName: clients.firstName,
              clientLastName: clients.lastName,
              clientEmail: clients.email,
            })
            .from(appointments)
            .leftJoin(clients, eq(clients.id, appointments.clientId))
            .where(inArray(appointments.id, appointmentIds))
        : Promise.resolve([]),
      clientIds.length > 0
        ? tx
            .select({
              id: clients.id,
              firstName: clients.firstName,
              lastName: clients.lastName,
              email: clients.email,
            })
            .from(clients)
            .where(inArray(clients.id, clientIds))
        : Promise.resolve([]),
      tx
        .select({
          journeyRunId: journeyRunEvents.journeyRunId,
          eventType: journeyRunEvents.eventType,
          metadata: journeyRunEvents.metadata,
          createdAt: journeyRunEvents.createdAt,
          id: journeyRunEvents.id,
        })
        .from(journeyRunEvents)
        .where(
          and(
            inArray(journeyRunEvents.journeyRunId, runIds),
            inArray(journeyRunEvents.eventType, [
              "run_created",
              "run_canceled",
            ]),
          ),
        )
        .orderBy(desc(journeyRunEvents.createdAt), desc(journeyRunEvents.id)),
      tx
        .select({
          journeyRunId: journeyDeliveries.journeyRunId,
          status: journeyDeliveries.status,
          reasonCode: journeyDeliveries.reasonCode,
          scheduledFor: journeyDeliveries.scheduledFor,
          channel: journeyDeliveries.channel,
          createdAt: journeyDeliveries.createdAt,
          id: journeyDeliveries.id,
        })
        .from(journeyDeliveries)
        .where(inArray(journeyDeliveries.journeyRunId, runIds))
        .orderBy(desc(journeyDeliveries.createdAt), desc(journeyDeliveries.id)),
      tx
        .select({
          journeyRunId: journeyRunStepLogs.journeyRunId,
          nodeType: journeyRunStepLogs.nodeType,
          status: journeyRunStepLogs.status,
          output: journeyRunStepLogs.output,
          input: journeyRunStepLogs.input,
          error: journeyRunStepLogs.error,
          startedAt: journeyRunStepLogs.startedAt,
          id: journeyRunStepLogs.id,
        })
        .from(journeyRunStepLogs)
        .where(inArray(journeyRunStepLogs.journeyRunId, runIds))
        .orderBy(
          desc(journeyRunStepLogs.startedAt),
          desc(journeyRunStepLogs.id),
        ),
    ]);

  const appointmentById = new Map(
    appointmentRows.map((row) => [row.id, row] as const),
  );
  const clientById = new Map(clientRows.map((row) => [row.id, row] as const));

  const triggerEventTypeByRunId = new Map<string, string>();
  const canceledReasonCodeByRunId = new Map<string, string>();
  for (const event of runEventRows) {
    const metadata = isRecord(event.metadata) ? event.metadata : null;

    if (
      event.eventType === "run_created" &&
      !triggerEventTypeByRunId.has(event.journeyRunId)
    ) {
      const triggerEventType =
        resolveTriggerEventTypeFromEventMetadata(metadata);
      if (triggerEventType) {
        triggerEventTypeByRunId.set(event.journeyRunId, triggerEventType);
      }
    }

    if (
      event.eventType === "run_canceled" &&
      !canceledReasonCodeByRunId.has(event.journeyRunId)
    ) {
      const reasonCode = metadata?.["reasonCode"];
      if (typeof reasonCode === "string" && reasonCode.trim().length > 0) {
        canceledReasonCodeByRunId.set(event.journeyRunId, reasonCode.trim());
      }
    }
  }

  const deliveriesByRunId = new Map<
    string,
    Array<{
      journeyRunId: string;
      status: typeof journeyDeliveries.$inferSelect.status;
      reasonCode: string | null;
      scheduledFor: Date;
      channel: string;
      createdAt: Date;
    }>
  >();
  for (const delivery of deliveryRows) {
    const existingDeliveries = deliveriesByRunId.get(delivery.journeyRunId);
    if (existingDeliveries) {
      existingDeliveries.push(delivery);
      continue;
    }

    deliveriesByRunId.set(delivery.journeyRunId, [delivery]);
  }

  const stepLogsByRunId = new Map<
    string,
    Array<{
      journeyRunId: string;
      nodeType: string;
      status: typeof journeyRunStepLogs.$inferSelect.status;
      output: Record<string, unknown> | null;
      input: Record<string, unknown> | null;
      error: string | null;
      startedAt: Date;
    }>
  >();
  for (const stepLog of stepLogRows) {
    const normalizedStepLog = {
      journeyRunId: stepLog.journeyRunId,
      nodeType: stepLog.nodeType,
      status: stepLog.status,
      output: isRecord(stepLog.output) ? stepLog.output : null,
      input: isRecord(stepLog.input) ? stepLog.input : null,
      error: stepLog.error,
      startedAt: stepLog.startedAt,
    };

    const existingStepLogs = stepLogsByRunId.get(stepLog.journeyRunId);
    if (existingStepLogs) {
      existingStepLogs.push(normalizedStepLog);
      continue;
    }

    stepLogsByRunId.set(stepLog.journeyRunId, [normalizedStepLog]);
  }

  return runs.map((row) => {
    const deliveries = deliveriesByRunId.get(row.id) ?? [];
    const stepLogs = stepLogsByRunId.get(row.id) ?? [];
    const nextState = resolveRunNextState({
      run: row,
      deliveries,
      stepLogs,
    });
    const canceledReasonCode = canceledReasonCodeByRunId.get(row.id) ?? null;
    const triggerEventType =
      triggerEventTypeByRunId.get(row.id) ??
      resolveTriggerEventTypeFromStepLogs({ stepLogs }) ??
      toTriggerEventTypeFromCanceledReason(canceledReasonCode);

    return {
      ...toJourneyRun(row),
      journeyId: resolveJourneyId(row),
      sidebarSummary: {
        subject: resolveRunSubject({
          run: row,
          appointmentById,
          clientById,
        }),
        triggerEventType,
        statusReason: resolveRunStatusReason({
          run: row,
          deliveries,
          stepLogs,
          canceledReasonCode,
        }),
        nextState,
        channelHint: resolveChannelHint({
          deliveries,
          stepLogs,
          nextState,
        }),
      },
    };
  });
}
