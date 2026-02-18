import {
  journeyRunEvents,
  journeyRunStepLogs,
  type journeyRunStepLogStatusEnum,
} from "@scheduling/db/schema";
import { sql } from "drizzle-orm";
import type { DbClient } from "../lib/db.js";

type JourneyRunStepLogStatus =
  (typeof journeyRunStepLogStatusEnum.enumValues)[number];

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    normalized[key] = entryValue;
  }

  return normalized;
}

export async function appendJourneyRunEvent(input: {
  tx: DbClient;
  orgId: string;
  runId: string;
  eventType: string;
  message: string;
  metadata?: unknown;
}): Promise<void> {
  await input.tx.insert(journeyRunEvents).values({
    orgId: input.orgId,
    journeyRunId: input.runId,
    eventType: input.eventType,
    message: input.message,
    metadata: asObject(input.metadata),
  });
}

export async function upsertJourneyRunStepLog(input: {
  tx: DbClient;
  orgId: string;
  runId: string;
  stepKey: string;
  nodeType: string;
  status: JourneyRunStepLogStatus;
  startedAt: Date;
  completedAt?: Date | null | undefined;
  durationMs?: number | null | undefined;
  logInput?: unknown;
  logOutput?: unknown;
  error?: string | null | undefined;
}): Promise<void> {
  await input.tx
    .insert(journeyRunStepLogs)
    .values({
      orgId: input.orgId,
      journeyRunId: input.runId,
      stepKey: input.stepKey,
      nodeType: input.nodeType,
      status: input.status,
      input: asObject(input.logInput),
      output: asObject(input.logOutput),
      error: input.error ?? null,
      startedAt: input.startedAt,
      completedAt: input.completedAt ?? null,
      durationMs: input.durationMs ?? null,
    })
    .onConflictDoUpdate({
      target: [
        journeyRunStepLogs.orgId,
        journeyRunStepLogs.journeyRunId,
        journeyRunStepLogs.stepKey,
      ],
      set: {
        nodeType: input.nodeType,
        status: input.status,
        input: asObject(input.logInput),
        output: asObject(input.logOutput),
        error: input.error ?? null,
        startedAt: input.startedAt,
        completedAt: input.completedAt ?? null,
        durationMs: input.durationMs ?? null,
        updatedAt: sql`now()`,
      },
    });
}
