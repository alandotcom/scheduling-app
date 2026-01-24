// Event emitter service for scheduling domain events
// Writes events to both the database outbox and the job queue

import { eventOutbox } from "@scheduling/db/schema";
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

// Generate a unique event ID (using timestamp + random for sortability)
function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `evt_${timestamp}_${random}`;
}

// Emit an event (writes to outbox and enqueues for processing)
export async function emitEvent<T>(
  orgId: string,
  type: EventType,
  payload: T,
  tx?: DbClient,
): Promise<string> {
  const eventId = generateEventId();
  const timestamp = new Date().toISOString();

  const event: DomainEvent<T> = {
    id: eventId,
    type,
    orgId,
    payload,
    timestamp,
  };

  // Write to outbox within the provided transaction or a new one
  const insertFn = async (database: DbClient) => {
    await database.insert(eventOutbox).values({
      orgId,
      type,
      payload: payload as Record<string, unknown>,
      status: "pending",
      nextAttemptAt: new Date(),
    });
  };

  if (tx) {
    await insertFn(tx);
  } else {
    await withOrg(orgId, insertFn);
  }

  // Enqueue for background processing
  try {
    await getJobQueue().enqueue(event);
  } catch (error) {
    // Log error but don't fail the main operation
    // The outbox worker will pick up unprocessed events
    console.error(
      "Failed to enqueue event, will be picked up by outbox worker:",
      error,
    );
  }

  return eventId;
}

// Convenience methods for specific event types
export const events = {
  // Appointment events
  appointmentCreated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment.created", payload, tx),

  appointmentUpdated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment.updated", payload, tx),

  appointmentCancelled: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment.cancelled", payload, tx),

  appointmentRescheduled: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment.rescheduled", payload, tx),

  appointmentNoShow: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment.no_show", payload, tx),

  // Calendar events
  calendarCreated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "calendar.created", payload, tx),

  calendarUpdated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "calendar.updated", payload, tx),

  calendarDeleted: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "calendar.deleted", payload, tx),

  // Appointment type events
  appointmentTypeCreated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment_type.created", payload, tx),

  appointmentTypeUpdated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment_type.updated", payload, tx),

  appointmentTypeDeleted: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "appointment_type.deleted", payload, tx),

  // Resource events
  resourceCreated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "resource.created", payload, tx),

  resourceUpdated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "resource.updated", payload, tx),

  resourceDeleted: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "resource.deleted", payload, tx),

  // Location events
  locationCreated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "location.created", payload, tx),

  locationUpdated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "location.updated", payload, tx),

  locationDeleted: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "location.deleted", payload, tx),

  // Client events
  clientCreated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "client.created", payload, tx),

  clientUpdated: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "client.updated", payload, tx),

  clientDeleted: <T>(orgId: string, payload: T, tx?: DbClient) =>
    emitEvent(orgId, "client.deleted", payload, tx),
};

// Close the job queue (for graceful shutdown)
export async function closeEventEmitter(): Promise<void> {
  if (jobQueue) {
    await jobQueue.close();
    jobQueue = null;
  }
}
