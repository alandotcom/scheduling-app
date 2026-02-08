// Event outbox processing worker
// Processes events from the queue and handles webhook delivery

import type { Job, Worker } from "bullmq";
import { eq, and, lte } from "drizzle-orm";
import { getLogger } from "@logtape/logtape";
import { forEachAsync } from "es-toolkit/array";
import { eventOutbox } from "@scheduling/db/schema";
import { db } from "../../lib/db.js";
import {
  isEventType,
  type DomainEvent,
  type WebhookDeliveryJob,
} from "./types.js";
import { createEventWorker, createWebhookWorker } from "./queue.js";

const logger = getLogger(["jobs"]);

// Workers (lazily initialized)
let eventWorker: Worker<DomainEvent> | null = null;
let webhookWorker: Worker<WebhookDeliveryJob> | null = null;

// Process domain events from the queue
async function processEvent(job: Job<DomainEvent>): Promise<void> {
  const event = job.data;

  logger.info(`Processing event: ${event.type} (${event.id})`);

  try {
    // Update outbox status to processing
    await db
      .update(eventOutbox)
      .set({ status: "processing" })
      .where(
        and(
          eq(eventOutbox.orgId, event.orgId),
          eq(eventOutbox.type, event.type),
        ),
      );

    // TODO: Look up webhook subscriptions for this org and event type
    // For now, just log the event and mark as delivered
    // In a real implementation, this would:
    // 1. Query webhook_subscriptions table for matching org_id + event_type
    // 2. Enqueue a webhook delivery job for each subscription

    // Mark as delivered in outbox
    await db
      .update(eventOutbox)
      .set({
        status: "delivered",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(eventOutbox.orgId, event.orgId),
          eq(eventOutbox.type, event.type),
        ),
      );

    logger.info(`Event processed successfully: ${event.type} (${event.id})`);
  } catch (error) {
    logger.error(
      `Failed to process event: ${event.type} (${event.id}): ${String(error)}`,
    );
    throw error; // Let BullMQ handle retry
  }
}

// Process webhook delivery jobs
async function processWebhook(job: Job<WebhookDeliveryJob>): Promise<void> {
  const { eventId, eventType, webhookUrl, payload, attemptNumber } = job.data;

  if (!webhookUrl) {
    logger.info(`No webhook URL for event ${eventId}, skipping delivery`);
    return;
  }

  logger.info(
    `Delivering webhook for ${eventType} to ${webhookUrl} (attempt ${attemptNumber})`,
  );

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Event-Type": eventType,
        "X-Event-ID": eventId,
        "X-Attempt-Number": String(attemptNumber),
      },
      body: JSON.stringify({
        id: eventId,
        type: eventType,
        data: payload,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed: ${response.status} ${response.statusText}`,
      );
    }

    logger.info(`Webhook delivered successfully: ${eventId} to ${webhookUrl}`);
  } catch (error) {
    logger.error(`Webhook delivery failed for ${eventId}: ${String(error)}`);
    throw error; // Let BullMQ handle retry
  }
}

// Start all workers
export function startWorkers(): void {
  if (!eventWorker) {
    eventWorker = createEventWorker(processEvent);
    eventWorker.on("completed", (job) => {
      logger.info(`Event job completed: ${job.id}`);
    });
    eventWorker.on("failed", (job, error) => {
      logger.error(`Event job failed: ${job?.id}: ${error.message}`);
    });
    logger.info("Event worker started");
  }

  if (!webhookWorker) {
    webhookWorker = createWebhookWorker(processWebhook);
    webhookWorker.on("completed", (job) => {
      logger.info(`Webhook job completed: ${job.id}`);
    });
    webhookWorker.on("failed", (job, error) => {
      logger.error(`Webhook job failed: ${job?.id}: ${error.message}`);
    });
    logger.info("Webhook worker started");
  }
}

// Stop all workers gracefully
export async function stopWorkers(): Promise<void> {
  if (eventWorker) {
    await eventWorker.close();
    eventWorker = null;
    logger.info("Event worker stopped");
  }

  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    logger.info("Webhook worker stopped");
  }
}

// Process stale outbox entries (fallback for missed queue entries)
// This should be run periodically (e.g., every minute via cron)
export async function processStaleOutboxEntries(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  const queue = await import("./queue.js");

  const staleEntries = await db
    .select()
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.status, "pending"),
        lte(eventOutbox.nextAttemptAt, staleThreshold),
      ),
    )
    .limit(100);

  await forEachAsync(
    staleEntries,
    async (entry) => {
      try {
        if (!isEventType(entry.type)) {
          logger.error(
            `Skipping stale entry ${entry.id}: unsupported event type ${entry.type}`,
          );
          return;
        }

        // Re-enqueue the event
        const event: DomainEvent = {
          id: entry.id,
          type: entry.type,
          orgId: entry.orgId,
          payload: entry.payload,
          timestamp: entry.createdAt.toISOString(),
        };

        await queue.getEventQueue().add(event.type, event, { jobId: event.id });

        // Update next attempt time
        await db
          .update(eventOutbox)
          .set({
            nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
            updatedAt: new Date(),
          })
          .where(eq(eventOutbox.id, entry.id));
      } catch (error) {
        logger.error(
          `Failed to re-enqueue stale entry ${entry.id}: ${String(error)}`,
        );
      }
    },
    { concurrency: 1 },
  );
}
