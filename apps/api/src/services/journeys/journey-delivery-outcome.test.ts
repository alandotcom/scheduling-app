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
} from "../../test-utils/index.js";
import type { ServiceContext } from "../locations.js";
import { recordDeliveryOutcome } from "./journey-delivery-outcome.js";

registerDbTestReset("per-file");

const db: TestDatabase = getTestDb();

async function seedSmsDelivery(context: ServiceContext) {
  const appointmentId = await createQuickAppointment(db as any, context.orgId);

  await setTestOrgContext(db, context.orgId);

  // Anchor near "now" so the computed durationMs stays within the int4 column.
  const scheduledFor = new Date(Date.now() - 60_000);
  const [run] = await db
    .insert(journeyRuns)
    .values({
      orgId: context.orgId,
      journeyVersionId: null,
      appointmentId,
      triggerEntityId: appointmentId,
      mode: "live",
      status: "running",
      journeyNameSnapshot: "Outcome Journey",
      journeyVersionSnapshot: { version: 1 },
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
    .returning({ id: journeyDeliveries.id });

  await db.insert(journeyRunStepLogs).values({
    orgId: context.orgId,
    journeyRunId: run!.id,
    stepKey: "send-sms-node",
    nodeType: "send-twilio",
    status: "running",
    startedAt: scheduledFor,
    input: { channel: "sms" },
    output: { status: "planned" },
    error: null,
  });

  return { runId: run!.id, deliveryId: delivery!.id };
}

describe("recordDeliveryOutcome", () => {
  test("applies a sent outcome to a planned delivery", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Outcome Sent Org",
    });
    const context: ServiceContext = { orgId: org.id, userId: user.id };
    const seeded = await seedSmsDelivery(context);

    const result = await recordDeliveryOutcome({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      status: "sent",
      reasonCode: null,
      providerMessageId: "twilio:SM123",
      providerMetadata: { twilioStatus: "delivered", twilioErrorCode: null },
      expectedChannel: "sms",
    });

    expect(result).toEqual({
      applied: true,
      status: "sent",
      reasonCode: null,
      detail: "applied_sent",
      runId: seeded.runId,
    });

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);
    expect(delivery?.status).toBe("sent");

    const [stepLog] = await db
      .select({
        status: journeyRunStepLogs.status,
        nodeType: journeyRunStepLogs.nodeType,
      })
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId))
      .limit(1);
    expect(stepLog?.status).toBe("success");
    // nodeType is taken from the delivery row's actionType (channel-neutral),
    // not a hardcoded "send-twilio".
    expect(stepLog?.nodeType).toBe("send-twilio");
  }, 20_000);

  test("applies a failed outcome with a reason code", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Outcome Failed Org",
    });
    const context: ServiceContext = { orgId: org.id, userId: user.id };
    const seeded = await seedSmsDelivery(context);

    const result = await recordDeliveryOutcome({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      status: "failed",
      reasonCode: "twilio_status:undelivered:error_30007",
      providerMessageId: "twilio:SM456",
      providerMetadata: {
        twilioStatus: "undelivered",
        twilioErrorCode: "30007",
      },
      expectedChannel: "sms",
    });

    expect(result.applied).toBe(true);
    expect(result.status).toBe("failed");
    expect(result.reasonCode).toBe("twilio_status:undelivered:error_30007");

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
  }, 20_000);

  test("ignores a delivery routed to a different channel", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Outcome Channel Org",
    });
    const context: ServiceContext = { orgId: org.id, userId: user.id };
    const seeded = await seedSmsDelivery(context);

    const result = await recordDeliveryOutcome({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      status: "sent",
      reasonCode: null,
      providerMessageId: "twilio:SM123",
      expectedChannel: "email",
    });

    expect(result.applied).toBe(false);
    expect(result.detail).toBe("ignored_non_email_delivery");

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);
    expect(delivery?.status).toBe("planned");
  }, 20_000);

  test("ignores a callback for a delivery that no longer exists", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Outcome Missing Org",
    });
    const context: ServiceContext = { orgId: org.id, userId: user.id };

    const result = await recordDeliveryOutcome({
      orgId: context.orgId,
      journeyDeliveryId: "00000000-0000-0000-0000-000000000000",
      status: "sent",
      reasonCode: null,
      providerMessageId: "twilio:SM123",
      expectedChannel: "sms",
    });

    expect(result).toEqual({
      applied: false,
      status: null,
      reasonCode: null,
      detail: "ignored_delivery_missing",
      runId: null,
    });
  }, 20_000);

  test("is idempotent: a duplicate callback for a settled delivery is ignored", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Outcome Idempotent Org",
    });
    const context: ServiceContext = { orgId: org.id, userId: user.id };
    const seeded = await seedSmsDelivery(context);

    const first = await recordDeliveryOutcome({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      status: "sent",
      reasonCode: null,
      providerMessageId: "twilio:SM123",
      expectedChannel: "sms",
    });
    expect(first.applied).toBe(true);

    // A redelivered/late Twilio callback finds the row already settled and is a
    // no-op rather than re-applying or corrupting the outcome.
    const second = await recordDeliveryOutcome({
      orgId: context.orgId,
      journeyDeliveryId: seeded.deliveryId,
      status: "failed",
      reasonCode: "twilio_status:undelivered:error_30007",
      providerMessageId: "twilio:SM999",
      expectedChannel: "sms",
    });

    expect(second.applied).toBe(false);
    expect(second.detail).toBe("ignored_delivery_already_sent");
    expect(second.runId).toBe(seeded.runId);

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
  }, 20_000);
});
