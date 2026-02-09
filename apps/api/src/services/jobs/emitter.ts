// Event emitter service for scheduling domain events
// Writes events to both the database outbox and the job queue

import { eventOutbox } from "@scheduling/db/schema";
import type { WebhookEventData } from "@scheduling/dto";
import type { DbClient } from "../../lib/db.js";
import { withOrg } from "../../lib/db.js";
import type { DomainEvent, EventType, JobQueue } from "./types.js";
import { BullMQJobQueue } from "./queue.js";

// Singleton job queue instance
let jobQueue: JobQueue | null = null;

function getJobQueue(): JobQueue {
  if (!jobQueue) {
    jobQueue = new BullMQJobQueue();
  }
  return jobQueue;
}

// Generate a unique event ID
function generateEventId(): string {
  return Bun.randomUUIDv7();
}

function toOutboxPayload(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return { value };
}

// Emit an event (writes to outbox and enqueues for processing)
export async function emitEvent<TEventType extends EventType>(
  orgId: string,
  type: TEventType,
  payload: WebhookEventData<TEventType>,
  tx?: DbClient,
): Promise<string> {
  const eventId = generateEventId();
  const timestamp = new Date().toISOString();

  const event: DomainEvent<TEventType> = {
    id: eventId,
    type,
    orgId,
    payload,
    timestamp,
  };

  // Write to outbox within the provided transaction or a new one
  const insertFn = async (database: DbClient) => {
    await database.insert(eventOutbox).values({
      id: eventId,
      orgId,
      type,
      payload: toOutboxPayload(payload),
      status: "pending",
      nextAttemptAt: new Date(),
    });
  };

  if (tx) {
    await insertFn(tx);
  } else {
    await withOrg(orgId, insertFn);
  }

  // Enqueue for background processing (fire-and-forget so it never blocks
  // the caller's database transaction — the outbox is the durable record)
  getJobQueue()
    .enqueue(event)
    .catch((error) => {
      console.error(
        "Failed to enqueue event, will be picked up by outbox worker:",
        error,
      );
    });

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
  if (jobQueue) {
    await jobQueue.close();
    jobQueue = null;
  }
}
