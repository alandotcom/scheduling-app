// Event emitter service for scheduling domain events.
// Sends typed events directly to Inngest.

import { getLogger } from "@logtape/logtape";
import type { WebhookEventData } from "@scheduling/dto";
import type { DbClient } from "../../lib/db.js";
import { inngest } from "../../inngest/client.js";
import type { EventType } from "./types.js";

const logger = getLogger(["events", "emitter"]);

function generateEventId(): string {
  return Bun.randomUUIDv7();
}

// Emit an event to Inngest. The tx argument is retained temporarily so
// existing call sites can migrate without a broad signature change.
export async function emitEvent<TEventType extends EventType>(
  orgId: string,
  type: TEventType,
  payload: WebhookEventData<TEventType>,
  _tx?: DbClient,
): Promise<string> {
  const eventId = generateEventId();
  const timestampMs = Date.now();

  try {
    await inngest.send({
      id: eventId,
      name: type,
      data: {
        orgId,
        ...payload,
      },
      ts: timestampMs,
    });
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
  return (
    orgId: string,
    payload: WebhookEventData<TEventType>,
    tx?: DbClient,
  ) => emitEvent(orgId, eventType, payload, tx);
}

// Convenience methods for specific event types
export const events = {
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
