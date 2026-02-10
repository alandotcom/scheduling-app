// Event outbox processing worker.
// Claims domain events from outbox and fans them out to enabled integration queues.

import type { Job, Worker } from "bullmq";
import { and, eq, lte, sql } from "drizzle-orm";
import { getLogger } from "@logtape/logtape";
import { forEachAsync } from "es-toolkit/array";
import {
  integrationSupportsEvent,
  type AnyDomainEvent,
  type IntegrationConsumer,
} from "@integrations/core";
import { eventOutbox, orgs } from "@scheduling/db/schema";
import { webhookEventDataSchemaByType } from "@scheduling/dto";
import { db, type DbClient, withOrg } from "../../lib/db.js";
import {
  clearEnabledIntegrationsCache,
  getEnabledIntegrationsForOrg,
  getRuntimeIntegrationConsumersForWorkers,
} from "../integrations/runtime.js";
import {
  createDispatchWorker,
  createFanoutWorker,
  createIntegrationWorker,
  enqueueIntegrationFanout,
  getDispatchQueue,
  getIntegrationQueueName,
  type FanoutJobData,
} from "./queue.js";
import { isEventType } from "./types.js";

const logger = getLogger(["jobs"]);
const STALE_OUTBOX_LOCK_KEY = 1_103_321;

let dispatchWorker: Worker<AnyDomainEvent> | null = null;
let fanoutWorker: Worker<FanoutJobData> | null = null;
const integrationWorkers = new Map<string, Worker<AnyDomainEvent>>();

type ProcessEventDependencies = {
  dbClient?: DbClient;
  now?: () => Date;
  integrations?: readonly IntegrationConsumer[];
  enqueueFanout?: typeof enqueueIntegrationFanout;
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

async function withStaleOutboxRunLock(run: () => Promise<void>): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${STALE_OUTBOX_LOCK_KEY}) AS locked`,
    );

    if (result[0]?.["locked"] !== true) {
      logger.debug(
        "Skipping stale outbox processing run: advisory lock is held by another worker",
      );
      return;
    }

    await run();
  });
}

// Process a dispatch job from the outbox queue.
export async function processEventJob(
  job: Job<AnyDomainEvent>,
  deps: ProcessEventDependencies = {},
): Promise<void> {
  const dbClient = deps.dbClient ?? db;
  const now = deps.now ?? (() => new Date());
  const hasInjectedDbClient = deps.dbClient !== undefined;
  const event = job.data;
  const integrations =
    deps.integrations ?? (await getEnabledIntegrationsForOrg(event.orgId));
  const enqueueFanout = deps.enqueueFanout ?? enqueueIntegrationFanout;

  const runOutboxQuery = async <T>(
    query: (database: DbClient) => Promise<T>,
  ): Promise<T> => {
    if (hasInjectedDbClient) {
      return query(dbClient);
    }

    // Default runtime worker path: scope each outbox query to the event org.
    // This keeps RLS-safe behavior without holding DB transactions open around queue calls.
    return withOrg(event.orgId, query);
  };

  logger.info(`Dispatching event: ${event.type} (${event.id})`, {
    eventId: event.id,
    eventType: event.type,
    orgId: event.orgId,
    attemptsMade: job.attemptsMade,
  });

  try {
    // Claim the outbox row atomically before fanout.
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

    const targetIntegrations = integrations.filter((integration) =>
      integrationSupportsEvent(integration, event.type),
    );

    if (targetIntegrations.length > 0) {
      await enqueueFanout(event, targetIntegrations);
    } else {
      logger.debug(
        "No enabled integrations support {eventType}; marking delivered",
        {
          eventId: event.id,
          eventType: event.type,
        },
      );
    }

    // Mark as delivered once dispatch fanout is enqueued.
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

    logger.info(`Event dispatched successfully: ${event.type} (${event.id})`);
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
        `Outbox row for ${event.id} still not ready after ${maxAttempts} attempts; skipping dispatch`,
      );
      return;
    }

    const willRetry = attemptNumber < maxAttempts;

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

    if (willRetry) {
      logger.warn(
        `Retrying event dispatch for ${event.id} (attempt ${attemptNumber}/${maxAttempts}): ${String(error)}`,
      );
      throw error;
    }

    logger.error(
      `Event dispatch exhausted retries for ${event.id} (attempt ${attemptNumber}/${maxAttempts}): ${String(error)}`,
    );
    throw error;
  }
}

async function processIntegrationJob(
  job: Job<AnyDomainEvent>,
  integration: IntegrationConsumer,
): Promise<void> {
  const event = job.data;

  if (!integrationSupportsEvent(integration, event.type)) {
    logger.warn(
      "Integration {integrationName} received unsupported event type {eventType}",
      {
        integrationName: integration.name,
        eventType: event.type,
        eventId: event.id,
      },
    );
    return;
  }

  await integration.process(event);

  logger.info("Integration processed event", {
    integrationName: integration.name,
    eventId: event.id,
    eventType: event.type,
  });
}

// Start all workers.
export function startWorkers(): void {
  const runtimeIntegrations = getRuntimeIntegrationConsumersForWorkers();

  if (!dispatchWorker) {
    dispatchWorker = createDispatchWorker((job) => processEventJob(job));
    dispatchWorker.on("completed", (job) => {
      logger.info(`Dispatch job completed: ${job.id}`);
    });
    dispatchWorker.on("failed", (job, error) => {
      logger.error(`Dispatch job failed: ${job?.id}: ${error.message}`);
    });
    logger.info("Dispatch worker started");
  }

  if (!fanoutWorker) {
    fanoutWorker = createFanoutWorker(async () => {
      // Parent flow job exists only as a join barrier and audit trail.
    });
    fanoutWorker.on("failed", (job, error) => {
      logger.error(`Fanout job failed: ${job?.id}: ${error.message}`);
    });
    logger.info("Fanout worker started");
  }

  for (const integration of runtimeIntegrations) {
    if (integrationWorkers.has(integration.name)) {
      continue;
    }

    const worker = createIntegrationWorker(integration, (job) =>
      processIntegrationJob(job, integration),
    );
    worker.on("failed", (job, error) => {
      logger.error(
        `Integration job failed (${integration.name}): ${job?.id}: ${error.message}`,
      );
    });

    integrationWorkers.set(integration.name, worker);
    logger.info("Integration worker started", {
      integrationName: integration.name,
      queueName: getIntegrationQueueName(integration.name),
    });
  }
}

// Stop all workers gracefully.
export async function stopWorkers(): Promise<void> {
  if (dispatchWorker) {
    await dispatchWorker.close();
    dispatchWorker = null;
    logger.info("Dispatch worker stopped");
  }

  if (fanoutWorker) {
    await fanoutWorker.close();
    fanoutWorker = null;
    logger.info("Fanout worker stopped");
  }

  await Promise.all(
    Array.from(
      integrationWorkers.entries(),
      async ([integrationName, worker]) => {
        await worker.close();
        logger.info("Integration worker stopped", { integrationName });
      },
    ),
  );
  integrationWorkers.clear();
  clearEnabledIntegrationsCache();
}

// Process stale outbox entries (fallback for missed queue entries).
// This should be run periodically (e.g., every minute via cron).
export async function processStaleOutboxEntries(): Promise<void> {
  logger.debug("Stale outbox sweep started");

  await withStaleOutboxRunLock(async () => {
    const startedAt = Date.now();
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const orgRows = await db.select({ orgId: orgs.id }).from(orgs);
    let orgsScanned = 0;
    let staleEntriesFound = 0;
    let eventsReenqueued = 0;
    let remaining = 100;

    await forEachAsync(
      orgRows,
      async ({ orgId }) => {
        orgsScanned += 1;

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

        staleEntriesFound += staleEntries.length;
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

              const payloadValidation = webhookEventDataSchemaByType[
                entry.type
              ].safeParse(entry.payload);
              if (!payloadValidation.success) {
                logger.error(
                  `Skipping stale entry ${entry.id}: payload does not match schema for ${entry.type}`,
                );
                return;
              }

              const event: AnyDomainEvent = {
                id: entry.id,
                type: entry.type,
                orgId: entry.orgId,
                payload: payloadValidation.data,
                timestamp: entry.createdAt.toISOString(),
              };

              await getDispatchQueue().add(event.type, event, {
                jobId: event.id,
              });
              eventsReenqueued += 1;

              await withOrg(orgId, (tx) =>
                tx
                  .update(eventOutbox)
                  .set({
                    nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
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

    logger.debug("Stale outbox sweep completed", {
      orgsScanned,
      staleEntriesFound,
      eventsReenqueued,
      elapsedMs: Date.now() - startedAt,
    });
  });
}
