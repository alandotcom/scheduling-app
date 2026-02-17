import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import { withOrg } from "../lib/db.js";
import {
  getTestDb,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import { createOrg } from "../test-utils/factories.js";
import type { ServiceContext } from "./locations.js";
import { executeJourneyDeliveryScheduled } from "./journey-delivery-worker.js";

const db: TestDatabase = getTestDb();

function createJourneyVersionSnapshot() {
  return {
    version: 1,
    definitionSnapshot: {
      attributes: {},
      options: { type: "directed" as const },
      nodes: [
        {
          key: "trigger-node",
          attributes: {
            id: "trigger-node",
            type: "trigger-node",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: {
                triggerType: "DomainEvent",
                domain: "appointment",
                startEvents: ["appointment.scheduled"],
                restartEvents: ["appointment.rescheduled"],
                stopEvents: ["appointment.canceled"],
              },
            },
          },
        },
        {
          key: "send-node",
          attributes: {
            id: "send-node",
            type: "action-node",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Send Message",
              config: {
                actionType: "send-message",
                channel: "email",
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "trigger-send",
          source: "trigger-node",
          target: "send-node",
          attributes: {
            id: "trigger-send",
            source: "trigger-node",
            target: "send-node",
          },
        },
      ],
    },
    publishedAt: "2026-02-16T09:00:00.000Z",
  };
}

async function seedPlannedDelivery(
  context: ServiceContext,
  scheduledFor: Date,
) {
  await setTestOrgContext(db, context.orgId);

  const [run] = await db
    .insert(journeyRuns)
    .values({
      orgId: context.orgId,
      journeyVersionId: null,
      appointmentId: crypto.randomUUID(),
      mode: "live",
      status: "planned",
      journeyNameSnapshot: "Worker Journey",
      journeyVersionSnapshot: createJourneyVersionSnapshot(),
    })
    .returning({ id: journeyRuns.id });

  const deterministicKey = `${run!.id}:send-node:${scheduledFor.toISOString()}`;

  const [delivery] = await db
    .insert(journeyDeliveries)
    .values({
      orgId: context.orgId,
      journeyRunId: run!.id,
      stepKey: "send-node",
      channel: "email",
      scheduledFor,
      status: "planned",
      deterministicKey,
    })
    .returning({
      id: journeyDeliveries.id,
      journeyRunId: journeyDeliveries.journeyRunId,
      deterministicKey: journeyDeliveries.deterministicKey,
      scheduledFor: journeyDeliveries.scheduledFor,
    });

  return {
    runId: run!.id,
    deliveryId: delivery!.id,
    deterministicKey: delivery!.deterministicKey,
    scheduledFor: delivery!.scheduledFor,
  };
}

describe("executeJourneyDeliveryScheduled", () => {
  let context: ServiceContext;

  beforeEach(async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Journey Delivery Worker Org",
    });

    context = {
      orgId: org.id,
      userId: user.id,
    };
  });

  test("sleeps until due and sends eligible delivery", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T10:00:00.000Z"),
    );

    const sleep = mock(async () => {});
    const dispatchDelivery = mock(async () => ({
      providerMessageId: "provider-message-1",
    }));

    const result = await executeJourneyDeliveryScheduled(
      {
        orgId: context.orgId,
        journeyDeliveryId: seeded.deliveryId,
        journeyRunId: seeded.runId,
        deterministicKey: seeded.deterministicKey,
        scheduledFor: seeded.scheduledFor.toISOString(),
      },
      {
        runtime: {
          runStep: async <T>(_stepId: string, fn: () => Promise<T>) => fn(),
          sleep,
        },
        now: () => new Date("2026-02-16T09:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(result.status).toBe("sent");
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("sent");
  });

  test("suppresses send when delivery is canceled during sleep", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T10:00:00.000Z"),
    );

    const sleep = mock(async () => {
      await withOrg(context.orgId, async (tx) => {
        await tx
          .update(journeyDeliveries)
          .set({
            status: "canceled",
            reasonCode: "manual_cancel",
          })
          .where(eq(journeyDeliveries.id, seeded.deliveryId));
      });
    });

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "should-not-send",
    }));

    const result = await executeJourneyDeliveryScheduled(
      {
        orgId: context.orgId,
        journeyDeliveryId: seeded.deliveryId,
        journeyRunId: seeded.runId,
        deterministicKey: seeded.deterministicKey,
        scheduledFor: seeded.scheduledFor.toISOString(),
      },
      {
        runtime: {
          runStep: async <T>(_stepId: string, fn: () => Promise<T>) => fn(),
          sleep,
        },
        now: () => new Date("2026-02-16T09:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(result.status).toBe("canceled");
    expect(dispatchDelivery).toHaveBeenCalledTimes(0);

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("canceled");
  });

  test("marks delivery failed after retry attempts are exhausted", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
    );

    const dispatchDelivery = mock(async () => {
      throw new Error("provider unavailable");
    });

    const result = await executeJourneyDeliveryScheduled(
      {
        orgId: context.orgId,
        journeyDeliveryId: seeded.deliveryId,
        journeyRunId: seeded.runId,
        deterministicKey: seeded.deterministicKey,
        scheduledFor: seeded.scheduledFor.toISOString(),
      },
      {
        runtime: {
          runStep: async <T>(_stepId: string, fn: () => Promise<T>) => fn(),
          sleep: async (_stepId: string, _delayMs: number) => {},
        },
        now: () => new Date("2026-02-16T09:00:00.000Z"),
        dispatchDelivery,
        maxDispatchAttempts: 2,
      },
    );

    expect(result.status).toBe("failed");
    expect(dispatchDelivery).toHaveBeenCalledTimes(2);

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("failed");
    expect(delivery?.reasonCode).toContain("provider_error");
  });

  test("forwards deterministic delivery key as adapter idempotency key", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
    );

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "provider-message-2",
    }));

    await executeJourneyDeliveryScheduled(
      {
        orgId: context.orgId,
        journeyDeliveryId: seeded.deliveryId,
        journeyRunId: seeded.runId,
        deterministicKey: seeded.deterministicKey,
        scheduledFor: seeded.scheduledFor.toISOString(),
      },
      {
        runtime: {
          runStep: async <T>(_stepId: string, fn: () => Promise<T>) => fn(),
          sleep: async (_stepId: string, _delayMs: number) => {},
        },
        now: () => new Date("2026-02-16T09:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(dispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: seeded.deterministicKey,
      }),
    );
  });
});
