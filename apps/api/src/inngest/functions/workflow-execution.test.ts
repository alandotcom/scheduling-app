import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import {
  computeRetryDelayMs,
  createWorkflowExecutionFunction,
} from "./workflow-execution.js";

const noopStepLogging = () => ({
  logStepStart: mock(async () => ({
    logId: "log_test",
    startTime: Date.now(),
  })),
  logStepComplete: mock(async () => {}),
});

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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "guard_blocked" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
      ...noopStepLogging(),
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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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

  test("records delivery using registry action execution metadata", async () => {
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
        {
          id: "node_a",
          kind: "action",
          actionId: "resend.sendEmail",
          integrationKey: "resend",
          input: {
            to: "client@example.com",
            subject: "Reminder",
            body: "Hello",
          },
        },
      ],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96049",
      entity: {},
    }));
    const executeAction = mock(async () => ({
      status: "ok" as const,
      channel: "integration.resend.sendEmail",
      target: "client@example.com",
      providerMessageId: "provider-msg-1",
      output: {
        channel: "integration.resend.sendEmail",
        target: "client@example.com",
        providerMessageId: "provider-msg-1",
      },
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      executeAction,
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
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96044",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96045",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_5a",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96049",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96049",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_5",
      status: "completed",
    });
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(recordDeliveryWithGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: "node_a",
        channel: "integration.resend.sendEmail",
        target: "client@example.com",
        providerMessageId: "provider-msg-1",
      }),
    );
  });

  test("marks terminal reason when registry action execution is invalid", async () => {
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
        {
          id: "node_a",
          kind: "action",
          actionId: "resend.sendEmail",
          integrationKey: "resend",
          input: {
            to: "client@example.com",
            subject: "Reminder",
            body: "Hello",
          },
        },
      ],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96050",
      entity: {},
    }));
    const executeAction = mock(async () => ({
      status: "invalid_action" as const,
      message: "Action disabled",
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      executeAction,
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
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96046",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96047",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_5b",
              type: "client.created",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96050",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96050",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_5",
      status: "completed",
      terminalReason: "invalid_action",
    });
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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

  test("skips action delivery when node guard does not match latest model", async () => {
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
        {
          id: "node_a",
          kind: "action",
          channel: "workflow.runtime",
          guard: {
            combinator: "all",
            conditions: [
              {
                field: "client.email",
                operator: "exists",
              },
            ],
          },
        },
      ],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96054",
      entity: {
        email: null,
      },
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96055",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96056",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_6_guard_skip",
              type: "client.updated",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96054",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96054",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_6",
      status: "completed",
    });
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(1);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
  });

  test("uses latest model lookup for reference-based wait nodes", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      entryNodeIds: ["node_wait"],
      nodes: [
        {
          id: "node_wait",
          kind: "wait",
          wait: {
            mode: "relative",
            duration: "PT1S",
            referenceField: "appointment.startsAt",
            offsetDirection: "before",
          },
        },
        { id: "node_action", kind: "action", channel: "workflow.runtime" },
      ],
      edges: [{ id: "edge_1", source: "node_wait", target: "node_action" }],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96057",
      entity: {
        startsAt: new Date(Date.now() + 1_000).toISOString(),
      },
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96058",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96059",
              workflowType: "appointment-reminder",
            },
            sourceEvent: {
              id: "evt_6_wait_reference",
              type: "appointment.updated",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                appointmentId: "0198d09f-ff07-7f46-a5d9-26a3f0d96057",
              },
            },
            entity: {
              type: "appointment",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96057",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_6",
      status: "completed",
    });
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(2);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(1);
  });

  test("defaults terminal source events to cancel_without_replacement", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 1);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      entryNodeIds: ["node_a"],
      nodes: [{ id: "node_a", kind: "action", channel: "workflow.runtime" }],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96060",
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96061",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96062",
              workflowType: "appointment-reminder",
            },
            sourceEvent: {
              id: "evt_6_terminal_default",
              type: "appointment.cancelled",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                appointmentId: "0198d09f-ff07-7f46-a5d9-26a3f0d96060",
              },
            },
            entity: {
              type: "appointment",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96060",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_6",
      status: "cancelled",
    });
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(1);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
  });

  test("allows terminal source events when cancelOnTerminalState is disabled", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      trigger: { replacement: { cancelOnTerminalState: false } },
      entryNodeIds: ["node_a"],
      nodes: [{ id: "node_a", kind: "action", channel: "workflow.runtime" }],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96063",
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96064",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96065",
              workflowType: "appointment-reminder",
            },
            sourceEvent: {
              id: "evt_6_terminal_override",
              type: "appointment.cancelled",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                appointmentId: "0198d09f-ff07-7f46-a5d9-26a3f0d96063",
              },
            },
            entity: {
              type: "appointment",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96063",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      orgId: "org_6",
      status: "completed",
    });
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(1);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(1);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(1);
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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
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

  test("retry policy marks run failed when attempt exceeds configured attempts", async () => {
    const recordRunStart = mock(async () => {});
    const cancelReplacedRuns = mock(async () => 0);
    const getRunGuard = mock(async () => ({
      runRevision: 1,
      runStatus: "running" as const,
    }));
    const loadCompiledPlan = mock(async () => ({
      planVersion: 1,
      trigger: { retryPolicy: { attempts: 1, backoff: "none" } },
      entryNodeIds: ["node_a"],
      nodes: [{ id: "node_a", kind: "action", channel: "workflow.runtime" }],
      edges: [],
    }));
    const loadCorrelatedEntity = mock(async () => ({
      status: "found" as const,
      entityType: "client",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d96081",
      entity: {},
    }));
    const recordDeliveryWithGuard = mock(async () => "recorded" as const);
    const markRunStatus = mock(async () => {});

    const fn = createWorkflowExecutionFunction({
      ...noopStepLogging(),
      recordRunStart,
      cancelReplacedRuns,
      getRunGuard,
      loadCompiledPlan,
      loadCorrelatedEntity,
      recordDeliveryWithGuard,
      markRunStatus,
    });
    const t = new InngestTestEngine({ function: fn });

    const output = await t.execute({
      events: [
        {
          name: "scheduling/workflow.triggered",
          data: {
            orgId: "org_9",
            workflow: {
              definitionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96082",
              versionId: "0198d09f-ff07-7f46-a5d9-26a3f0d96083",
              workflowType: "follow-up",
            },
            sourceEvent: {
              id: "evt_9",
              type: "client.updated",
              timestamp: "2026-02-11T12:00:00.000Z",
              payload: {
                clientId: "0198d09f-ff07-7f46-a5d9-26a3f0d96081",
              },
            },
            entity: {
              type: "client",
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d96081",
            },
          },
        },
      ],
      transformCtx: (ctx) => ({ ...ctx, attempt: 1 }),
    });

    expect(output.result).toMatchObject({
      orgId: "org_9",
      status: "failed",
    });
    expect(cancelReplacedRuns).toHaveBeenCalledTimes(0);
    expect(loadCorrelatedEntity).toHaveBeenCalledTimes(0);
    expect(getRunGuard).toHaveBeenCalledTimes(0);
    expect(recordDeliveryWithGuard).toHaveBeenCalledTimes(0);
    expect(markRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_9",
        runId: expect.any(String),
        status: "failed",
      }),
    );
  });

  test("retry delay helper computes fixed and exponential delays", () => {
    expect(
      computeRetryDelayMs({
        attempt: 1,
        backoff: "fixed",
        baseDelayMs: 2000,
        maxDelayMs: null,
      }),
    ).toBe(2000);

    expect(
      computeRetryDelayMs({
        attempt: 2,
        backoff: "exponential",
        baseDelayMs: 1000,
        maxDelayMs: null,
      }),
    ).toBe(2000);

    expect(
      computeRetryDelayMs({
        attempt: 4,
        backoff: "exponential",
        baseDelayMs: 1000,
        maxDelayMs: 5000,
      }),
    ).toBe(5000);
  });
});
