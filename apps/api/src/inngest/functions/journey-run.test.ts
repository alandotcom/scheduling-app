import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createJourneyRunFunction } from "./journey-run.js";

describe("journey-run function", () => {
  test("maps the journey.run.start event into the run executor input", async () => {
    const runExecutor = mock(async () => ({
      journeyRunId: "run_1",
      status: "completed" as const,
      outcome: "completed" as const,
      visitedNodeIds: ["send-node"],
    }));

    const fn = createJourneyRunFunction(runExecutor);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          id: "evt-run-start-1",
          ts: 1_700_000_000_000,
          name: "journey.run.start",
          data: {
            orgId: "org_1",
            journeyRunId: "run_1",
            journeyId: "journey_1",
            journeyVersionId: "version_1",
            triggerEntityType: "appointment",
            triggerEntityId: "appt_1",
            appointmentId: "appt_1",
            clientId: null,
            mode: "live",
            triggerBranch: "scheduled",
            triggerEventType: "appointment.scheduled",
            eventTimestamp: "2026-06-19T10:00:00.000Z",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      journeyRunId: "run_1",
      status: "completed",
    });

    expect(runExecutor).toHaveBeenCalledTimes(1);
    expect(runExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        journeyRunId: "run_1",
        journeyId: "journey_1",
        journeyVersionId: "version_1",
        triggerEntityType: "appointment",
        triggerEntityId: "appt_1",
        appointmentId: "appt_1",
        clientId: null,
        mode: "live",
        triggerBranch: "scheduled",
        eventTimestamp: "2026-06-19T10:00:00.000Z",
      }),
      // The function wires a step-backed runtime (runStep/sleepUntil/waitForEvent).
      expect.objectContaining({
        runtime: expect.objectContaining({
          runStep: expect.any(Function),
          sleepUntil: expect.any(Function),
          waitForEvent: expect.any(Function),
        }),
      }),
    );
  });
});
