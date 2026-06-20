import { journeyDeliveries, journeyRunStepLogs } from "@scheduling/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "../../lib/db.js";
import { isRecord } from "../../lib/type-guards.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";

// Channel-neutral reducer that applies a provider's terminal delivery outcome to
// the journey-run projection: it flips the delivery row planned -> sent/failed,
// finalizes the step log, and appends a delivery_sent/delivery_failed run event.
// Integration callbacks (e.g. Twilio) map their vendor status into this shape and
// call here, so journey-run artifacts stay owned by the journey domain.

export type DeliveryOutcomeResult = {
  applied: boolean;
  status: "sent" | "failed" | null;
  reasonCode: string | null;
  detail: string;
  runId: string | null;
};

export async function recordDeliveryOutcome(input: {
  orgId: string;
  journeyDeliveryId: string;
  status: "sent" | "failed";
  reasonCode: string | null;
  providerMessageId: string;
  providerMetadata?: Record<string, unknown>;
  // When set, the outcome only applies to a delivery on this channel (a Twilio
  // SMS callback must not settle a delivery the journey routed to another channel).
  expectedChannel?: string;
}): Promise<DeliveryOutcomeResult> {
  const providerMetadata = input.providerMetadata ?? {};

  const result = await withOrg(input.orgId, async (tx) => {
    const [delivery] = await tx
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
        status: journeyDeliveries.status,
        scheduledFor: journeyDeliveries.scheduledFor,
        reasonCode: journeyDeliveries.reasonCode,
        channel: journeyDeliveries.channel,
        actionType: journeyDeliveries.actionType,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, input.journeyDeliveryId))
      .limit(1);

    if (!delivery) {
      return {
        applied: false,
        status: null,
        reasonCode: null,
        detail: "ignored_delivery_missing",
        runId: null,
      };
    }

    if (input.expectedChannel && delivery.channel !== input.expectedChannel) {
      return {
        applied: false,
        status: null,
        reasonCode: null,
        detail: `ignored_non_${input.expectedChannel}_delivery`,
        runId: null,
      };
    }

    if (delivery.status !== "planned") {
      return {
        applied: false,
        status: null,
        reasonCode: delivery.reasonCode,
        detail: `ignored_delivery_already_${delivery.status}`,
        runId: delivery.journeyRunId,
      };
    }

    const [updated] = await tx
      .update(journeyDeliveries)
      .set({
        status: input.status,
        reasonCode: input.reasonCode,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(journeyDeliveries.id, input.journeyDeliveryId),
          eq(journeyDeliveries.status, "planned"),
        ),
      )
      .returning({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
        status: journeyDeliveries.status,
        scheduledFor: journeyDeliveries.scheduledFor,
      });

    if (!updated) {
      return {
        applied: false,
        status: null,
        reasonCode: null,
        detail: "ignored_delivery_updated_concurrently",
        runId: delivery.journeyRunId,
      };
    }

    const [existingStepLog] = await tx
      .select({
        input: journeyRunStepLogs.input,
        startedAt: journeyRunStepLogs.startedAt,
      })
      .from(journeyRunStepLogs)
      .where(
        and(
          eq(journeyRunStepLogs.journeyRunId, updated.journeyRunId),
          eq(journeyRunStepLogs.stepKey, updated.stepKey),
        ),
      )
      .limit(1);

    const startedAt = existingStepLog?.startedAt ?? updated.scheduledFor;
    const completedAt = new Date();

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: updated.journeyRunId,
      stepKey: updated.stepKey,
      nodeType: delivery.actionType,
      status: input.status === "sent" ? "success" : "error",
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      logInput: isRecord(existingStepLog?.input) ? existingStepLog.input : {},
      logOutput: {
        status: input.status,
        reasonCode: input.reasonCode,
        providerMessageId: input.providerMessageId,
        ...providerMetadata,
      },
      error:
        input.status === "failed"
          ? (input.reasonCode ?? "provider_error")
          : null,
    });

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: updated.journeyRunId,
      eventType: input.status === "sent" ? "delivery_sent" : "delivery_failed",
      message: `Delivery ${updated.stepKey} ${
        input.status === "sent" ? "sent" : "failed"
      }`,
      metadata: {
        stepKey: updated.stepKey,
        reasonCode: input.status === "failed" ? input.reasonCode : null,
        providerMessageId: input.providerMessageId,
        ...providerMetadata,
      },
    });

    return {
      applied: true,
      status: input.status,
      reasonCode: input.reasonCode,
      detail: `applied_${input.status}`,
      runId: updated.journeyRunId,
    };
  });

  return result;
}
