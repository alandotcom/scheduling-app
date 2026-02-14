import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createWorkflowScheduleDispatchFunction } from "./workflow-schedule-dispatch.js";

describe("workflow schedule dispatch function", () => {
  test("dispatches due schedule bindings and updates next run", async () => {
    const now = new Date("2026-02-13T12:30:22.000Z");

    const listOrgIds = mock(async () => ["org_1"]);
    const listDueTargets = mock(async () => [
      {
        bindingId: "binding_1",
        definitionId: "def_1",
        versionId: "ver_1",
        workflowType: "appointment-reminder",
        scheduleExpression: "*/15 * * * *",
        scheduleTimezone: "America/New_York",
        nextRunAt: now,
        compiledPlan: null,
      },
    ]);
    const dispatchTriggeredEvent = mock(async () => {});
    const updateNextRunAt = mock(async () => {});

    const fn = createWorkflowScheduleDispatchFunction({
      now: () => now,
      listOrgIds,
      listDueTargets,
      updateNextRunAt,
      dispatchTriggeredEvent,
    });

    const t = new InngestTestEngine({ function: fn });
    const { result } = await t.execute();

    expect(result).toMatchObject({
      scheduledAt: now.toISOString(),
      dispatchedRunCount: 1,
    });

    expect(listOrgIds).toHaveBeenCalledTimes(1);
    expect(listDueTargets).toHaveBeenCalledTimes(1);
    expect(listDueTargets).toHaveBeenCalledWith({ orgId: "org_1", now });

    expect(dispatchTriggeredEvent).toHaveBeenCalledTimes(1);
    expect(dispatchTriggeredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "schedule:org_1:def_1:ver_1:1770985800000",
        name: "scheduling/workflow.triggered",
        data: {
          orgId: "org_1",
          workflow: {
            definitionId: "def_1",
            versionId: "ver_1",
            workflowType: "appointment-reminder",
          },
          sourceEvent: {
            id: "schedule:org_1:def_1:ver_1:1770985800000",
            type: "schedule.triggered",
            timestamp: now.toISOString(),
            payload: {
              scheduleExpression: "*/15 * * * *",
              scheduleTimezone: "America/New_York",
              triggeredAt: now.toISOString(),
            },
          },
          entity: {
            type: "workflow",
            id: "def_1",
          },
        },
      }),
    );

    expect(updateNextRunAt).toHaveBeenCalledTimes(1);
    const updateCall = (updateNextRunAt.mock.calls[0] as unknown[])?.[0] as
      | { nextRunAt: Date | null }
      | undefined;
    expect(updateCall).toBeDefined();
    expect(updateCall).toMatchObject({
      orgId: "org_1",
      bindingId: "binding_1",
    });
    expect(updateCall?.nextRunAt).toBeInstanceOf(Date);
    expect(updateCall?.nextRunAt?.toISOString()).toBe(
      "2026-02-13T12:45:00.000Z",
    );
  });

  test("returns zero dispatched runs when no schedules are due", async () => {
    const listOrgIds = mock(async () => ["org_1", "org_2"]);
    const listDueTargets = mock(async () => []);
    const dispatchTriggeredEvent = mock(async () => {});
    const updateNextRunAt = mock(async () => {});

    const fn = createWorkflowScheduleDispatchFunction({
      now: () => new Date("2026-02-13T14:00:00.000Z"),
      listOrgIds,
      listDueTargets,
      updateNextRunAt,
      dispatchTriggeredEvent,
    });

    const t = new InngestTestEngine({ function: fn });
    const { result } = await t.execute();

    expect(result).toMatchObject({
      dispatchedRunCount: 0,
    });
    expect(listDueTargets).toHaveBeenCalledTimes(2);
    expect(dispatchTriggeredEvent).toHaveBeenCalledTimes(0);
    expect(updateNextRunAt).toHaveBeenCalledTimes(0);
  });
});
