import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createWorkflowDispatchFunction } from "./workflow-dispatch.js";

describe("workflow dispatch function", () => {
  test("dispatches one workflow-triggered event per matching binding", async () => {
    const resolveTargets = mock(async () => [
      {
        definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94001",
        versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94002",
        workflowType: "appointment-reminder",
        compiledPlan: null,
      },
      {
        definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94003",
        versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94004",
        workflowType: "follow-up",
        compiledPlan: null,
      },
    ]);
    const dispatchTriggered = mock(async () => {});

    const fn = createWorkflowDispatchFunction(
      "client.created",
      resolveTargets,
      dispatchTriggered,
    );
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          id: "evt-client-created-1",
          ts: 1_700_000_000_000,
          name: "client.created",
          data: {
            orgId: "org_1",
            clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d95001",
            firstName: "Ada",
            lastName: "Lovelace",
            email: null,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      sourceEventId: "evt-client-created-1",
      sourceEventType: "client.created",
      orgId: "org_1",
      scheduledWorkflowCount: 2,
    });

    expect(resolveTargets).toHaveBeenCalledTimes(1);
    expect(resolveTargets).toHaveBeenCalledWith("org_1", "client.created");

    expect(dispatchTriggered).toHaveBeenCalledTimes(2);
    const calls = dispatchTriggered.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toMatchObject({
      id: "evt-client-created-1:0198d09f-ff07-7f46-a5d9-26a3f0d94001:0198d09f-ff07-7f46-a5d9-26a3f0d94002",
      name: "scheduling/workflow.triggered",
      data: {
        orgId: "org_1",
        workflow: {
          definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94001",
          versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94002",
          workflowType: "appointment-reminder",
        },
        entity: {
          type: "client",
          id: "0198d09f-ff07-7f46-a5d9-26a3f0d95001",
        },
      },
    });
  });

  test("returns zero scheduled workflows when no bindings are enabled", async () => {
    const resolveTargets = mock(async () => []);
    const dispatchTriggered = mock(async () => {});

    const fn = createWorkflowDispatchFunction(
      "appointment.created",
      resolveTargets,
      dispatchTriggered,
    );
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "appointment.created",
          data: {
            orgId: "org_2",
            appointmentId: "0198d09f-ff07-7f46-a5d9-26a3f0d95002",
            calendarId: "0198d09f-ff07-7f46-a5d9-26a3f0d95003",
            appointmentTypeId: "0198d09f-ff07-7f46-a5d9-26a3f0d95004",
            clientId: null,
            startAt: "2026-02-11T10:00:00.000Z",
            endAt: "2026-02-11T10:30:00.000Z",
            timezone: "America/New_York",
            status: "scheduled",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      sourceEventType: "appointment.created",
      orgId: "org_2",
      scheduledWorkflowCount: 0,
    });
    expect(dispatchTriggered).toHaveBeenCalledTimes(0);
  });

  test("builds deterministic source event IDs when event.id is missing", async () => {
    const resolveTargets = mock(async () => [
      {
        definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94010",
        versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94011",
        workflowType: "client-onboarding",
        compiledPlan: null,
      },
    ]);
    const dispatchTriggered = mock(async () => {});

    const fn = createWorkflowDispatchFunction(
      "client.created",
      resolveTargets,
      dispatchTriggered,
    );
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          ts: 1_700_000_000_000,
          name: "client.created",
          data: {
            orgId: "org_3",
            clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d95020",
            firstName: "Grace",
            lastName: "Hopper",
            email: null,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      sourceEventType: "client.created",
      orgId: "org_3",
      scheduledWorkflowCount: 1,
    });
    expect(typeof (result as { sourceEventId: unknown }).sourceEventId).toBe(
      "string",
    );

    const dispatchCalls = dispatchTriggered.mock.calls as unknown[][];
    const firstTriggered = dispatchCalls[0]?.[0] as
      | {
          id: string;
          data: {
            sourceEvent: {
              id: string;
              type: string;
            };
          };
        }
      | undefined;
    expect(firstTriggered).toBeDefined();
    expect(firstTriggered?.data.sourceEvent.type).toBe("client.created");
    expect(firstTriggered?.id).toBe(
      `${firstTriggered?.data.sourceEvent.id}:0198d09f-ff07-7f46-a5d9-26a3f0d94010:0198d09f-ff07-7f46-a5d9-26a3f0d94011`,
    );
  });

  test("uses debounced deterministic IDs when trigger debounce is enabled", async () => {
    const resolveTargets = mock(async () => [
      {
        definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94020",
        versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d94021",
        workflowType: "client-onboarding",
        compiledPlan: {
          planVersion: 1,
          trigger: {
            debounce: {
              enabled: true,
              window: "PT10M",
              strategy: "latest_only",
            },
          },
        },
      },
    ]);
    const dispatchTriggered = mock(async () => {});

    const fn = createWorkflowDispatchFunction(
      "client.updated",
      resolveTargets,
      dispatchTriggered,
    );
    const t = new InngestTestEngine({ function: fn });

    await t.execute({
      events: [
        {
          id: "evt-client-updated-1",
          ts: 1_700_000_000_000,
          name: "client.updated",
          data: {
            orgId: "org_4",
            clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d95030",
            changes: { firstName: "Ada" },
            previous: {
              firstName: "A",
              lastName: "Lovelace",
              email: null,
              phone: null,
            },
          },
        },
      ],
    });

    await t.execute({
      events: [
        {
          id: "evt-client-updated-2",
          ts: 1_700_000_000_100,
          name: "client.updated",
          data: {
            orgId: "org_4",
            clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d95030",
            changes: { firstName: "Ada-2" },
            previous: {
              firstName: "Ada",
              lastName: "Lovelace",
              email: null,
              phone: null,
            },
          },
        },
      ],
    });

    expect(dispatchTriggered).toHaveBeenCalledTimes(2);
    const firstTriggered = (
      dispatchTriggered.mock.calls[0] as unknown[]
    )?.[0] as { id: string } | undefined;
    const secondTriggered = (
      dispatchTriggered.mock.calls[1] as unknown[]
    )?.[0] as { id: string } | undefined;

    expect(firstTriggered?.id).toBeDefined();
    expect(secondTriggered?.id).toBeDefined();
    expect(firstTriggered?.id).toBe(secondTriggered?.id);
    expect(firstTriggered?.id.startsWith("debounce:client.updated:")).toBe(
      true,
    );
  });
});
