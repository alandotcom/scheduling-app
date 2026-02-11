// Event emitter service for scheduling domain events.
// Sends typed events directly to Inngest.

import { getLogger } from "@logtape/logtape";
import {
  webhookEventDataSchemaByType,
  webhookEventTypeSchema,
  type WebhookEventData,
} from "@scheduling/dto";
import { z } from "zod";
import { webhookInngest } from "../../inngest/client.js";
import type { EventType } from "./types.js";

const logger = getLogger(["events", "emitter"]);

function generateEventId(): string {
  return Bun.randomUUIDv7();
}

const webhookSendPayloadBaseSchema = z.object({
  id: z.string(),
  name: webhookEventTypeSchema,
  data: z.looseObject({ orgId: z.string() }),
  ts: z.number(),
});

function isWebhookSendPayload(
  value: unknown,
): value is Parameters<typeof webhookInngest.send>[0] {
  const parsed = webhookSendPayloadBaseSchema.safeParse(value);
  if (!parsed.success) {
    return false;
  }

  const { name, data } = parsed.data;
  const { orgId: _orgId, ...payload } = data;

  return webhookEventDataSchemaByType[name].safeParse(payload).success;
}

export async function emitEvent<TEventType extends EventType>(
  orgId: string,
  type: TEventType,
  payload: WebhookEventData<TEventType>,
): Promise<string> {
  const eventId = generateEventId();
  const timestampMs = Date.now();

  try {
    const sendPayload = {
      id: eventId,
      name: type,
      data: {
        orgId,
        ...payload,
      },
      ts: timestampMs,
    };

    if (!isWebhookSendPayload(sendPayload)) {
      throw new Error("Invalid webhook payload shape");
    }

    await webhookInngest.send(sendPayload);
  } catch (error) {
    // Temporary migration behavior: preserve successful write paths even if the
    // local Inngest runtime is unavailable.
    logger.error("Failed sending event to Inngest: {error}", {
      error,
      eventId,
      eventType: type,
      orgId,
    });
  }

  return eventId;
}

function createTypedEmitter<TEventType extends EventType>(
  eventType: TEventType,
) {
  return (orgId: string, payload: WebhookEventData<TEventType>) =>
    emitEvent(orgId, eventType, payload);
}

type SnakeToCamel<TValue extends string> =
  TValue extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
    : TValue;

type EventTypeToEmitterKey<TEventType extends EventType> =
  TEventType extends `${infer Entity}.${infer Action}`
    ? `${SnakeToCamel<Entity>}${Capitalize<SnakeToCamel<Action>>}`
    : never;

type TypedEmitter<TEventType extends EventType> = (
  orgId: string,
  payload: WebhookEventData<TEventType>,
) => Promise<string>;

type EventEmitters = {
  [TEventType in EventType as EventTypeToEmitterKey<TEventType>]: TypedEmitter<TEventType>;
};

// Convenience methods for specific event types
export const events: EventEmitters = {
  // Appointment events
  appointmentCreated: createTypedEmitter("appointment.created"),

  appointmentUpdated: createTypedEmitter("appointment.updated"),

  appointmentCancelled: createTypedEmitter("appointment.cancelled"),

  appointmentRescheduled: createTypedEmitter("appointment.rescheduled"),

  appointmentNoShow: createTypedEmitter("appointment.no_show"),

  // Calendar events
  calendarCreated: createTypedEmitter("calendar.created"),

  calendarUpdated: createTypedEmitter("calendar.updated"),

  calendarDeleted: createTypedEmitter("calendar.deleted"),

  // Appointment type events
  appointmentTypeCreated: createTypedEmitter("appointment_type.created"),

  appointmentTypeUpdated: createTypedEmitter("appointment_type.updated"),

  appointmentTypeDeleted: createTypedEmitter("appointment_type.deleted"),

  // Resource events
  resourceCreated: createTypedEmitter("resource.created"),

  resourceUpdated: createTypedEmitter("resource.updated"),

  resourceDeleted: createTypedEmitter("resource.deleted"),

  // Location events
  locationCreated: createTypedEmitter("location.created"),

  locationUpdated: createTypedEmitter("location.updated"),

  locationDeleted: createTypedEmitter("location.deleted"),

  // Client events
  clientCreated: createTypedEmitter("client.created"),

  clientUpdated: createTypedEmitter("client.updated"),

  clientDeleted: createTypedEmitter("client.deleted"),
};

// Close the job queue (for graceful shutdown)
export async function closeEventEmitter(): Promise<void> {
  // No-op after Inngest migration; kept for compatibility with existing callers.
}
