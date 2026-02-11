import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createWorkflowExecutionFunction } from "./workflow-execution.js";

describe("workflow execution function", () => {
  test("records run start and marks run completed", async () => {
    const recordRunStart = mock(async () => {});
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_1",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96001",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96002",
              workflowType: "appointment-reminder",
            },
            sourceEvent: {
              id: "evt_1",
              type: "appointment.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                appointmentId: "0198d09f-ff07-7f46-a5d9-26a3f0d96003",
              },
            },
            entity: {
              type: "appointment",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96003",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_1",
      definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96001",
      versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96002",
      workflowType: "appointment-reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96003",
      status: "completed",
    });

    expect(recordRunStart).toHaveBeenCalledTimes(1);
    expect(markRunStatus).toHaveBeenCalledTimes(1);

    const startCalls = recordRunStart.mock.calls as unknown[][];
    const statusCalls = markRunStatus.mock.calls as unknown[][];
    const startInput = startCalls[0]?.[0] as Record<string, unknown>;
    const statusInput = statusCalls[0]?.[0] as Record<string, unknown>;

    expect(typeof startInput?.["runId"]).toBe("string");
    expect(startInput?.["orgId"]).toBe("org_1");
    expect(statusInput?.["orgId"]).toBe("org_1");
    expect(statusInput?.["status"]).toBe("completed");
    expect(typeof statusInput?.["runId"]).toBe("string");
  });

  test("does not mark completed when recording run start fails", async () => {
    const recordRunStart = mock(async () => {
      throw new Error("db write failed");
    });
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_2",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96011",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96012",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_2",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96013",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96013",
            },
          },
        },
      ],
    });

    expect(recordRunStart).toHaveBeenCalledTimes(1);
    expect(markRunStatus).toHaveBeenCalledTimes(0);
  });
});
