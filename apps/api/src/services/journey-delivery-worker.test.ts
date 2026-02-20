import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../inngest/runtime-events.js", () => ({
  sendJourneyDeliveryScheduled: async () => ({}),
  sendJourneyActionExecuteForActionType: async () => ({}),
  sendJourneyActionSendTwilioCallbackReceived: async () => ({}),
  sendJourneyDeliveryCanceled: async () => ({}),
}));

import { eq } from "drizzle-orm";
import {
  journeyDeliveries,
  journeyRunEvents,
  journeyRunStepLogs,
  journeyRuns,
} from "@scheduling/db/schema";
import { withOrg } from "../lib/db.js";
import {
  getTestDb,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import {
  createAppointment,
  createAppointmentType,
  createCalendar,
  createClient,
  createOrg,
  createQuickAppointment,
} from "../test-utils/factories.js";
import type { ServiceContext } from "./locations.js";
import { executeJourneyDeliveryScheduled } from "./journey-delivery-worker.js";
import { dispatchJourneySendResendAction } from "./integrations/resend/delivery.js";
import { JourneyDeliveryNonRetryableError } from "./delivery-dispatch-helpers.js";

const db: TestDatabase = getTestDb();

function createJourneyVersionSnapshot(input?: {
  stepKey?: string;
  actionType?:
    | "send-resend"
    | "send-resend-template"
    | "send-slack"
    | "send-twilio"
    | "logger"
    | "wait-resume"
    | "wait-for-confirmation-timeout";
}) {
  const stepKey = input?.stepKey ?? "send-node";
  const actionType = input?.actionType ?? "send-resend";

  const config =
    actionType === "logger"
      ? {
          actionType: "logger",
          message: "Logger delivery event",
        }
      : actionType === "send-twilio"
        ? {
            actionType: "send-twilio",
            message: "Reminder",
            toPhone: "@Appointment.data.client.phone",
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

function createWaitResumeJourneyVersionSnapshot() {
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
          key: "wait-node",
          attributes: {
            id: "wait-node",
            type: "action-node",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Wait",
              config: {
                actionType: "wait",
                waitDuration: "2h",
              },
            },
          },
        },
        {
          key: "send-node",
          attributes: {
            id: "send-node",
            type: "action-node",
            position: { x: 0, y: 240 },
            data: {
              type: "action",
              label: "Send",
              config: {
                actionType: "send-resend",
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
          attributes: {
            id: "trigger-to-wait",
            source: "trigger-node",
            target: "wait-node",
          },
        },
        {
          key: "wait-to-send",
          source: "wait-node",
          target: "send-node",
          attributes: {
            id: "wait-to-send",
            source: "wait-node",
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
  input?: {
    stepKey?: string;
    actionType?:
      | "send-resend"
      | "send-resend-template"
      | "send-slack"
      | "send-twilio"
      | "logger"
      | "wait-resume"
      | "wait-for-confirmation-timeout";
    channel?: "email" | "slack" | "sms" | "logger" | "internal";
    mode?: "live" | "test";
    appointmentId?: string;
    journeyVersionSnapshot?: Record<string, unknown>;
  },
) {
  const stepKey = input?.stepKey ?? "send-node";
  const actionType = input?.actionType ?? "send-resend";
  const channel = input?.channel ?? "email";
  const mode = input?.mode ?? "live";

  const appointmentId =
    input?.appointmentId ??
    (await createQuickAppointment(db as any, context.orgId));

  await setTestOrgContext(db, context.orgId);

  const [run] = await db
    .insert(journeyRuns)
    .values({
      orgId: context.orgId,
      journeyVersionId: null,
      appointmentId,
      triggerEntityId: appointmentId,
      mode,
      status: "planned",
      journeyNameSnapshot: "Worker Journey",
      journeyVersionSnapshot:
        input?.journeyVersionSnapshot ??
        createJourneyVersionSnapshot({
          stepKey,
          actionType,
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
      actionType,
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

    const stepLogs = await db
      .select({
        status: journeyRunStepLogs.status,
        stepKey: journeyRunStepLogs.stepKey,
      })
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId));
    expect(stepLogs).toHaveLength(1);
    expect(stepLogs[0]?.status).toBe("success");

    const events = await db
      .select({ eventType: journeyRunEvents.eventType })
      .from(journeyRunEvents)
      .where(eq(journeyRunEvents.journeyRunId, seeded.runId));
    expect(events.some((event) => event.eventType === "delivery_sent")).toBe(
      true,
    );
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

  test("does not retry non-retryable dispatch failures", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
    );

    const dispatchDelivery = mock(async () => {
      throw new JourneyDeliveryNonRetryableError("invalid recipient");
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
        maxDispatchAttempts: 3,
      },
    );

    expect(result.status).toBe("failed");
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(result.reasonCode).toContain("provider_error:invalid recipient");
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

  test("marks resend deliveries in test mode as log-only by default", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
      {
        mode: "test",
        stepKey: "resend-test-node",
        actionType: "send-resend",
        channel: "email",
      },
    );

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
        dispatchDelivery: (dispatchInput) =>
          dispatchJourneySendResendAction(dispatchInput, {
            resolveTestRecipient: async () => null,
          }),
      },
    );

    expect(result.status).toBe("sent");
    expect(result.reasonCode).toBe("test_mode_log_only");

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
    expect(delivery?.reasonCode).toBe("test_mode_log_only");
  });

  test("passes appointmentId to dispatch input for provider-side context loading", async () => {
    const calendar = await createCalendar(db as any, context.orgId);
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const client = await createClient(db as any, context.orgId, {
      firstName: "",
      lastName: "",
      phone: "+14155552671",
    });
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      clientId: client.id,
      startAt: new Date("2026-02-16T11:00:00.000Z"),
      endAt: new Date("2026-02-16T11:30:00.000Z"),
    });

    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
      {
        stepKey: "send-sms-node",
        actionType: "send-twilio",
        channel: "sms",
        appointmentId: appointment.id,
      },
    );

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "twilio:SM123",
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
          sleep: async (_stepId: string, _delayMs: number) => {},
        },
        now: () => new Date("2026-02-16T09:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(result.status).toBe("sent");
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(dispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: appointment.id,
      }),
    );
  });

  test("does not include template context in dispatch input or step-log payloads", async () => {
    const calendar = await createCalendar(db as any, context.orgId);
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const client = await createClient(db as any, context.orgId, {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+14155552671",
    });
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      clientId: client.id,
      startAt: new Date("2026-02-16T11:00:00.000Z"),
      endAt: new Date("2026-02-16T11:30:00.000Z"),
    });

    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
      {
        stepKey: "send-sms-node",
        actionType: "send-twilio",
        channel: "sms",
        appointmentId: appointment.id,
      },
    );

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "twilio:SM456",
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
    const calls = dispatchDelivery.mock.calls as unknown as [
      Record<string, unknown>,
    ][];
    const dispatchCall = calls[0]![0];
    expect(dispatchCall["templateContext"]).toBeUndefined();
    expect(dispatchCall["appointmentId"]).toBe(appointment.id);

    await setTestOrgContext(db, context.orgId);
    const [stepLog] = await db
      .select()
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId))
      .limit(1);

    const logInput =
      typeof stepLog?.input === "object" && stepLog.input
        ? (stepLog.input as Record<string, unknown>)
        : {};

    expect(logInput["channel"]).toBe("sms");
    expect(logInput["stepConfig"]).toBeDefined();
    expect(logInput["templateContext"]).toBeUndefined();
  });

  test("keeps live Twilio deliveries planned until callback processing", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T09:00:00.000Z"),
      {
        stepKey: "send-sms-node",
        actionType: "send-twilio",
        channel: "sms",
      },
    );

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "twilio:SM999",
      awaitingAsyncCallback: true,
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
          sleep: async (_stepId: string, _delayMs: number) => {},
        },
        now: () => new Date("2026-02-16T09:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(result.status).toBe("sent");
    expect(result.providerMessageId).toBe("twilio:SM999");
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);

    await setTestOrgContext(db, context.orgId);
    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);
    expect(delivery?.status).toBe("planned");
    expect(delivery?.reasonCode).toBeNull();

    const [stepLog] = await db
      .select({
        status: journeyRunStepLogs.status,
      })
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId))
      .limit(1);

    expect(stepLog?.status).toBe("running");
  });

  test("intercepts wait-resume delivery and calls executeWaitResume", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T12:00:00.000Z"),
      {
        stepKey: "wait-node",
        actionType: "wait-resume",
        channel: "internal",
        journeyVersionSnapshot: createWaitResumeJourneyVersionSnapshot(),
      },
    );

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "should-not-be-called",
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
          sleep: async (_stepId: string, _delayMs: number) => {},
        },
        now: () => new Date("2026-02-16T12:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(result.status).toBe("sent");
    expect(dispatchDelivery).toHaveBeenCalledTimes(0);

    await setTestOrgContext(db, context.orgId);

    const [delivery] = await db
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("sent");

    const stepLogs = await db
      .select({
        status: journeyRunStepLogs.status,
        stepKey: journeyRunStepLogs.stepKey,
        nodeType: journeyRunStepLogs.nodeType,
      })
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId));

    const waitResumeLog = stepLogs.find(
      (log) => log.nodeType === "wait-resume",
    );
    expect(waitResumeLog).toBeDefined();
    expect(waitResumeLog?.status).toBe("success");
  });

  test("intercepts wait-for-confirmation-timeout delivery", async () => {
    const seeded = await seedPlannedDelivery(
      context,
      new Date("2026-02-16T12:00:00.000Z"),
      {
        stepKey: "wait-node",
        actionType: "wait-for-confirmation-timeout",
        channel: "internal",
      },
    );

    const dispatchDelivery = mock(async () => ({
      providerMessageId: "should-not-be-called",
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
          sleep: async (_stepId: string, _delayMs: number) => {},
        },
        now: () => new Date("2026-02-16T12:00:00.000Z"),
        dispatchDelivery,
      },
    );

    expect(result.status).toBe("sent");
    expect(dispatchDelivery).toHaveBeenCalledTimes(0);

    await setTestOrgContext(db, context.orgId);

    const [delivery] = await db
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, seeded.deliveryId))
      .limit(1);

    expect(delivery?.status).toBe("sent");

    const stepLogs = await db
      .select({
        status: journeyRunStepLogs.status,
        nodeType: journeyRunStepLogs.nodeType,
      })
      .from(journeyRunStepLogs)
      .where(eq(journeyRunStepLogs.journeyRunId, seeded.runId));

    const timeoutLog = stepLogs.find(
      (log) => log.nodeType === "wait-for-confirmation-timeout",
    );
    expect(timeoutLog).toBeDefined();
    expect(timeoutLog?.status).toBe("success");
  });
});
