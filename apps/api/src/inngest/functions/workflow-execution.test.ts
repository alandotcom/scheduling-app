import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createWorkflowExecutionFunction } from "./workflow-execution.js";

describe("workflow execution function", () => {
  test("records run start and marks run completed", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => null);
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96003",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
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
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96003",
              },
            },
            entity: {
              type: "client",
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
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96003",
      status: "completed",
    });

    expect(recordRunStart).toHaveBeenCalledTimes(1);
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(1);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(1);
    expect(getRunGuard).toHaveBeenCalledTimes(1);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(1);
    expect(markRunStatus).toHaveBeenCalledTimes(1);

    expect(recordRunStart).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        runId: expect.any(String),
        definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96001",
        entityType: "client",
      }),
    );
    expect(markRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        runId: expect.any(String),
        status: "completed",
      }),
    );
    expect(recordDeliveryWithGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        runId: expect.any(String),
        stepId: "workflow.execution.completed",
        channel: "workflow.runtime",
      }),
    );
  });

  test("does not advance run state when recording run start fails", async () => {
    const recordRunStart = mock(async () => {
      throw new Error("db write failed");
    });
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => null);
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96013",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
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
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(0);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(0);
    expect(getRunGuard).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
    expect(markRunStatus).toHaveBeenCalledTimes(0);
  });

  test("marks run cancelled when side-effect send guard blocks", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 2,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => null);
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96023",
    }));
    const recordDeliveryWithGuard = mock(async () => "guard_blocked" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_3",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96021",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96022",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_3",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96023",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96023",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_3",
      status: "cancelled",
    });
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(1);
    expect(markRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_3",
        runId: expect.any(String),
        status: "cancelled",
      }),
    );
  });

  test("completes gracefully without side effects when correlated entity is missing", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => null);
    const loadCorrelatedEntity = mock(async () => ({
      status: "missing" as const,
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96031",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_4",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96032",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96033",
              workflowType: "appointment-reminder",
            },
            sourceEvent: {
              id: "evt_4",
              type: "appointment.updated",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                appointmentId: "0198d09f-ff07-7f46-a5d9-26a3f0d96031",
              },
            },
            entity: {
              type: "appointment",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96031",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_4",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96031",
      status: "completed",
      terminalReason: "entity_missing",
    });

    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(1);
    expect(getRunGuard).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
    expect(markRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_4",
        runId: expect.any(String),
        status: "completed",
      }),
    );
  });

  test("executes compiled plan action nodes in graph order", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      entryNodeIds: ["node_a"],
      nodes: [
        { id: "node_a", kind: "action", channel: "workflow.runtime" },
        { id: "node_b", kind: "action", channel: "workflow.runtime" },
      ],
      edges: [{ id: "edge_1", source: "node_a", target: "node_b" }],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96041",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_5",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96042",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96043",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_5",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96041",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96041",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_5",
      status: "completed",
    });
    expect(loadCompiledPlan).toHaveBeenCalledTimes(1);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(2);
    expect(getRunGuard).toHaveBeenCalledTimes(2);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(2);
    const deliveryCalls = recordDeliveryWithGuard.mock.calls as unknown[][];
    expect(deliveryCalls[0]?.[0]).toMatchObject({ stepId: "node_a" });
    expect(deliveryCalls[1]?.[0]).toMatchObject({ stepId: "node_b" });
  });

  test("does not run legacy placeholder action for empty compiled plans", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      entryNodeIds: [],
      nodes: [],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96051",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_6",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96052",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96053",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_6",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96051",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96051",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_6",
      status: "completed",
    });
    expect(loadCompiledPlan).toHaveBeenCalledTimes(1);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(0);
    expect(getRunGuard).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
  });

  test("replacement allow_parallel skips cancelling active runs", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      trigger: { replacement: { mode: "allow_parallel" } },
      entryNodeIds: ["node_a"],
      nodes: [{ id: "node_a", kind: "action", channel: "workflow.runtime" }],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96061",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_7",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96062",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96063",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_7",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96061",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96061",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_7",
      status: "completed",
    });
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(1);
  });

  test("replacement cancel_without_replacement cancels run before actions", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 1);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      trigger: { replacement: { mode: "cancel_without_replacement" } },
      entryNodeIds: ["node_a"],
      nodes: [{ id: "node_a", kind: "action", channel: "workflow.runtime" }],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96071",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_8",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96072",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96073",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_8",
              type: "client.updated",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96071",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96071",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_8",
      status: "cancelled",
    });
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(1);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(0);
    expect(getRunGuard).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
    expect(markRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_8",
        runId: expect.any(String),
        status: "cancelled",
      }),
    );
  });
});
