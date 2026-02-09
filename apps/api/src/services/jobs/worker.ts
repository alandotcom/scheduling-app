// Event outbox processing worker
// Processes domain events from the queue and publishes to Svix.

import type { Job, Worker } from "bullmq";
import { eq, and, lte } from "drizzle-orm";
import { getLogger } from "@logtape/logtape";
import { forEachAsync } from "es-toolkit/array";
import { eventOutbox, orgs } from "@scheduling/db/schema";
import { db, type DbClient, withOrg } from "../../lib/db.js";
import {
  getSvixErrorStatusCode,
  isRetriableSvixError,
  isSvixConflictError,
  publishWebhookEvent,
} from "../svix.js";
import { isEventType, type DomainEvent } from "./types.js";
import { createEventWorker } from "./queue.js";

const logger = getLogger(["jobs"]);

// Workers (lazily initialized)
let eventWorker: Worker<DomainEvent> | null = null;

type ProcessEventDependencies = {
  dbClient?: DbClient;
  publishEvent?: typeof publishWebhookEvent;
  now?: () => Date;
};

class OutboxRowNotReadyError extends Error {
  constructor(eventId: string) {
    super(`Outbox row is not ready for event ${eventId}`);
    this.name = "OutboxRowNotReadyError";
  }
}

function isOutboxRowNotReadyError(error: unknown): boolean {
  return error instanceof OutboxRowNotReadyError;
}

function getRetryDelayMs(attemptNumber: number): number {
  // Keep this aligned with queue exponential backoff defaults.
  return Math.min(300_000, 1000 * 2 ** Math.max(0, attemptNumber - 1));
}

// Process domain events from the queue
export async function processEventJob(
  job: Job<DomainEvent>,
  deps: ProcessEventDependencies = {},
): Promise<void> {
  const dbClient = deps.dbClient ?? db;
  const publishEvent = deps.publishEvent ?? publishWebhookEvent;
  const now = deps.now ?? (() => new Date());
  const hasInjectedDbClient = deps.dbClient !== undefined;
  const event = job.data;

  const runOutboxQuery = async <T>(
    query: (database: DbClient) => Promise<T>,
  ): Promise<T> => {
    if (hasInjectedDbClient) {
      return query(dbClient);
    }

    // Default runtime worker path: scope each outbox query to the event org.
    // This keeps RLS-safe behavior without holding DB transactions open around network calls.
    return withOrg(event.orgId, query);
  };

  logger.info(`Processing event: ${event.type} (${event.id})`, {
    eventId: event.id,
    eventType: event.type,
    orgId: event.orgId,
    attemptsMade: job.attemptsMade,
  });

  try {
    // Claim the outbox row atomically before publishing.
    // If no row is transitioned, the row is not yet committed/visible (or no longer pending).
    const claimedRows = await runOutboxQuery((database) =>
      database
        .update(eventOutbox)
        .set({
          status: "processing",
          updatedAt: now(),
        })
        .where(
          and(eq(eventOutbox.id, event.id), eq(eventOutbox.status, "pending")),
        )
        .returning({ id: eventOutbox.id }),
    );

    if (claimedRows.length === 0) {
      throw new OutboxRowNotReadyError(event.id);
    }

    await publishEvent({
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });

    // Mark as delivered in outbox
    await runOutboxQuery((database) =>
      database
        .update(eventOutbox)
        .set({
          status: "delivered",
          nextAttemptAt: null,
          updatedAt: now(),
        })
        .where(
          and(
            eq(eventOutbox.id, event.id),
            eq(eventOutbox.status, "processing"),
          ),
        ),
    );

    logger.info(`Event processed successfully: ${event.type} (${event.id})`);
  } catch (error) {
    const attemptNumber = job.attemptsMade + 1;
    const maxAttempts =
      typeof job.opts.attempts === "number" ? job.opts.attempts : 1;

    if (isOutboxRowNotReadyError(error)) {
      const willRetry = attemptNumber < maxAttempts;

      if (willRetry) {
        logger.warn(
          `Outbox row not committed/visible yet for ${event.id}; retrying (${attemptNumber}/${maxAttempts})`,
        );
        throw error;
      }

      logger.warn(
        `Outbox row for ${event.id} still not ready after ${maxAttempts} attempts; skipping publish`,
      );
      return;
    }

    if (isSvixConflictError(error)) {
      // Message already exists in Svix for this eventId, which is effectively delivered.
      await runOutboxQuery((database) =>
        database
          .update(eventOutbox)
          .set({
            status: "delivered",
            nextAttemptAt: null,
            updatedAt: now(),
          })
          .where(
            and(
              eq(eventOutbox.id, event.id),
              eq(eventOutbox.status, "processing"),
            ),
          ),
      );

      logger.info(
        `Event already delivered in Svix: ${event.type} (${event.id})`,
      );
      return;
    }

    const statusCode = getSvixErrorStatusCode(error);
    const retriable = isRetriableSvixError(error);
    const willRetry = retriable && attemptNumber < maxAttempts;

    await runOutboxQuery((database) =>
      database
        .update(eventOutbox)
        .set({
          status: willRetry ? "pending" : "failed",
          nextAttemptAt: willRetry
            ? new Date(now().getTime() + getRetryDelayMs(attemptNumber))
            : null,
          updatedAt: now(),
        })
        .where(
          and(
            eq(eventOutbox.id, event.id),
            eq(eventOutbox.status, "processing"),
          ),
        ),
    );

    if (!retriable) {
      logger.error(
        `Permanent Svix publish failure for ${event.id} (status ${statusCode ?? "unknown"}): ${String(error)}`,
      );
      return;
    }

    if (willRetry) {
      logger.warn(
        `Retrying Svix publish for ${event.id} (attempt ${attemptNumber}/${maxAttempts}, status ${statusCode ?? "unknown"})`,
      );
      throw error; // Let BullMQ schedule retry
    }

    logger.error(
      `Svix publish exhausted retries for ${event.id} (attempt ${attemptNumber}/${maxAttempts}, status ${statusCode ?? "unknown"})`,
    );
  }
}

// Start all workers
export function startWorkers(): void {
  if (!eventWorker) {
    eventWorker = createEventWorker(processEventJob);
    eventWorker.on("completed", (job) => {
      logger.info(`Event job completed: ${job.id}`);
    });
    eventWorker.on("failed", (job, error) => {
      logger.error(`Event job failed: ${job?.id}: ${error.message}`);
    });
    logger.info("Event worker started");
  }
}

// Stop all workers gracefully
export async function stopWorkers(): Promise<void> {
  if (eventWorker) {
    await eventWorker.close();
    eventWorker = null;
    logger.info("Event worker stopped");
  }
}

// Process stale outbox entries (fallback for missed queue entries)
// This should be run periodically (e.g., every minute via cron)
export async function processStaleOutboxEntries(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  const queue = await import("./queue.js");
  const orgRows = await db.select({ orgId: orgs.id }).from(orgs);
  let remaining = 100;

  await forEachAsync(
    orgRows,
    async ({ orgId }) => {
      if (remaining <= 0) {
        return;
      }

      const staleEntries = await withOrg(orgId, (tx) =>
        tx
          .select()
          .from(eventOutbox)
          .where(
            and(
              eq(eventOutbox.status, "pending"),
              lte(eventOutbox.nextAttemptAt, staleThreshold),
            ),
          )
          .limit(remaining),
      );

      remaining -= staleEntries.length;

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

            await queue
              .getEventQueue()
              .add(event.type, event, { jobId: event.id });

            // Update next attempt time
            await withOrg(orgId, (tx) =>
              tx
                .update(eventOutbox)
                .set({
                  nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(eventOutbox.id, entry.id),
                    eq(eventOutbox.status, "pending"),
                  ),
                ),
            );
          } catch (error) {
            logger.error(
              `Failed to re-enqueue stale entry ${entry.id}: ${String(error)}`,
            );
          }
        },
        { concurrency: 1 },
      );
    },
    { concurrency: 1 },
  );
}
