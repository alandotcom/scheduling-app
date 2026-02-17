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

function createJourneyVersionSnapshot(input?: {
  stepKey?: string;
  actionType?: "send-resend" | "send-resend-template" | "send-slack" | "logger";
  channel?: "email" | "slack" | "logger";
}) {
  const stepKey = input?.stepKey ?? "send-node";
  const actionType = input?.actionType ?? "send-resend";

  const config =
    actionType === "logger"
      ? {
          actionType: "logger",
          message: "Logger delivery event",
        }
      : {
          actionType,
        };

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
                triggerType: "AppointmentJourney",
                start: "appointment.scheduled",
                restart: "appointment.rescheduled",
                stop: "appointment.canceled",
                correlationKey: "appointmentId",
              },
            },
          },
        },
        {
          key: stepKey,
          attributes: {
            id: stepKey,
            type: "action-node",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: actionType === "logger" ? "Logger" : "Send Message",
              config,
            },
          },
        },
      ],
      edges: [
        {
          key: `trigger-${stepKey}`,
          source: "trigger-node",
          target: stepKey,
          attributes: {
            id: `trigger-${stepKey}`,
            source: "trigger-node",
            target: stepKey,
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
  input?: {
    stepKey?: string;
    actionType?:
      | "send-resend"
      | "send-resend-template"
      | "send-slack"
      | "logger";
    channel?: "email" | "slack" | "logger";
  },
) {
  const stepKey = input?.stepKey ?? "send-node";
  const actionType = input?.actionType ?? "send-resend";
  const channel = input?.channel ?? "email";

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
      journeyVersionSnapshot: createJourneyVersionSnapshot({
        stepKey,
        actionType,
        channel,
      }),
    })
    .returning({ id: journeyRuns.id });

  const deterministicKey = `${run!.id}:${stepKey}:${scheduledFor.toISOString()}`;

  const [delivery] = await db
    .insert(journeyDeliveries)
    .values({
      orgId: context.orgId,
      journeyRunId: run!.id,
      stepKey,
      channel,
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

  test("executes logger delivery and emits structured console sink output", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
      {
        stepKey: "logger-node",
        actionType: "logger",
        channel: "logger",
      },
    );

    const infoSpy = mock(() => {});
    const originalConsoleInfo = console.info;
    console.info = infoSpy as typeof console.info;

    try {
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
        },
      );

      expect(result.status).toBe("sent");
    } finally {
      console.info = originalConsoleInfo;
    }

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      "[journey-logger-delivery]",
      expect.objectContaining({
        orgId: context.orgId,
        journeyRunId: seeded.runId,
        journeyDeliveryId: seeded.deliveryId,
        channel: "logger",
        idempotencyKey: seeded.deterministicKey,
      }),
    );

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
        channel: journeyDeliveries.channel,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("sent");
    expect(delivery?.channel).toBe("logger");
  });
});
