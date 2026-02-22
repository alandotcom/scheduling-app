import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  journeyDeliveries,
  journeyRunStepLogs,
  journeyRuns,
} from "@scheduling/db/schema";
import {
  createOrg,
  createQuickAppointment,
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
  type TestDatabase,
} from "../../../test-utils/index.js";
import type { ServiceContext } from "../../locations.js";
import { applyTwilioStatusCallback } from "./callbacks.js";

registerDbTestReset("per-file");

const db: TestDatabase = getTestDb();

async function seedTwilioDelivery(context: ServiceContext) {
  const appointmentId = await createQuickAppointment(db as any, context.orgId);

  await setTestOrgContext(db, context.orgId);

  const scheduledFor = new Date("2026-02-16T09:00:00.000Z");
  const [run] = await db
    .insert(journeyRuns)
    .values({
      orgId: context.orgId,
      journeyVersionId: null,
      appointmentId,
      triggerEntityId: appointmentId,
      mode: "live",
      status: "running",
      journeyNameSnapshot: "Callback Journey",
      journeyVersionSnapshot: {
        version: 1,
      },
    })
    .returning({ id: journeyRuns.id });

  const [delivery] = await db
    .insert(journeyDeliveries)
    .values({
      orgId: context.orgId,
      journeyRunId: run!.id,
      stepKey: "send-sms-node",
      channel: "sms",
      actionType: "send-twilio",
      scheduledFor,
      status: "planned",
      deterministicKey: `${run!.id}:send-sms-node:${scheduledFor.toISOString()}`,
    })
    .returning({
      id: journeyDeliveries.id,
      journeyRunId: journeyDeliveries.journeyRunId,
    });

  await db.insert(journeyRunStepLogs).values({
    orgId: context.orgId,
    journeyRunId: run!.id,
    stepKey: "send-sms-node",
    nodeType: "send-twilio",
    status: "running",
    startedAt: scheduledFor,
    input: {
      channel: "sms",
    },
    output: {
      status: "planned",
    },
    error: null,
  });

  return {
    runId: run!.id,
    deliveryId: delivery!.id,
  };
}

describe("applyTwilioStatusCallback", () => {
  test("marks delivery sent and completes run on delivered callback", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Twilio Callback Org",
    });
    const context: ServiceContext = {
      orgId: org.id,
      userId: user.id,
    };

    const seeded = await seedTwilioDelivery(context);

    const result = await applyTwilioStatusCallback({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      messageSid: "SM123",
      messageStatus: "delivered",
      errorCode: null,
    });

    expect(result).toEqual({
      applied: true,
      status: "sent",
      reasonCode: null,
      detail: "applied_sent",
    });

    await setTestOrgContext(db, context.orgId);

    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("sent");
    expect(delivery?.reasonCode).toBeNull();

    const [stepLog] = await db
      .select({
        status: journeyRunStepLogs.status,
      })
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId))
      .limit(1);

    expect(stepLog?.status).toBe("success");

    const [run] = await db
      .select({
        status: journeyRuns.status,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, seeded.runId))
      .limit(1);

    expect(run?.status).toBe("completed");
  }, 20_000);

  test("marks delivery failed on undelivered callback", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Twilio Callback Org",
    });
    const context: ServiceContext = {
      orgId: org.id,
      userId: user.id,
    };

    const seeded = await seedTwilioDelivery(context);

    const result = await applyTwilioStatusCallback({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      messageSid: "SM456",
      messageStatus: "undelivered",
      errorCode: "30007",
    });

    expect(result).toEqual({
      applied: true,
      status: "failed",
      reasonCode: "twilio_status:undelivered:error_30007",
      detail: "applied_failed",
    });

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
    expect(delivery?.reasonCode).toBe("twilio_status:undelivered:error_30007");

    const [run] = await db
      .select({
        status: journeyRuns.status,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, seeded.runId))
      .limit(1);

    expect(run?.status).toBe("failed");
  }, 20_000);

  test("ignores non-terminal callback statuses", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Twilio Callback Org",
    });
    const context: ServiceContext = {
      orgId: org.id,
      userId: user.id,
    };

    const seeded = await seedTwilioDelivery(context);

    const result = await applyTwilioStatusCallback({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      messageSid: "SM789",
      messageStatus: "queued",
      errorCode: null,
    });

    expect(result).toEqual({
      applied: false,
      status: null,
      reasonCode: null,
      detail: "ignored_non_terminal_status:queued",
    });

    await setTestOrgContext(db, context.orgId);

    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("planned");
  }, 20_000);
});
