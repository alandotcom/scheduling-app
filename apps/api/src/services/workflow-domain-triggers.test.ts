import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { workflowExecutions, workflowWaitStates } from "@scheduling/db/schema";
import type {
  DomainEventData,
  DomainEventType,
  SerializedWorkflowGraph,
} from "@scheduling/dto";
import { getDomainForDomainEventType } from "@scheduling/dto";
import {
  getTestDb,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import { createOrg } from "../test-utils/factories.js";
import { workflowService } from "./workflows.js";
import { processWorkflowDomainEvent } from "./workflow-domain-triggers.js";

function createGraphWithDomainEventTrigger(
  startEvents: DomainEventType[],
  restartEvents: DomainEventType[] = [],
  stopEvents: DomainEventType[] = [],
): SerializedWorkflowGraph {
  const domainEvent =
    startEvents[0] ??
    restartEvents[0] ??
    stopEvents[0] ??
    "appointment.created";

  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-1",
        attributes: {
          id: "trigger-1",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            label: "Trigger",
            type: "trigger",
            config: {
              triggerType: "DomainEvent",
              domain: getDomainForDomainEventType(domainEvent),
              startEvents,
              restartEvents,
              stopEvents,
            },
          },
        },
      },
    ],
    edges: [],
  };
}

function createClientCreatedPayload(): DomainEventData<"client.created"> {
  return {
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
    phone: null,
  };
}

function createClientUpdatedPayload(): DomainEventData<"client.updated"> {
  return {
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
    phone: null,
    previous: {
      clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
    },
  };
}

describe("workflow domain triggers", () => {
  const db: TestDatabase = getTestDb();

  let orgA: { id: string };
  let userA: { id: string };
  let orgB: { id: string };
  let userB: { id: string };

  beforeEach(async () => {
    const primaryResult = await createOrg(db as any, {
      name: "Workflow Org A",
      email: "workflow-org-a@example.com",
    });
    orgA = primaryResult.org;
    userA = primaryResult.user;

    const secondaryResult = await createOrg(db as any, {
      name: "Workflow Org B",
      email: "workflow-org-b@example.com",
    });
    orgB = secondaryResult.org;
    userB = secondaryResult.user;
  });

  test("starts execution and enqueues workflow run for matching domain event", async () => {
    const workflow = await workflowService.create(
      {
        name: "Client Workflow",
        graph: createGraphWithDomainEventTrigger(["client.created"]),
        isEnabled: true,
      },
      {
        orgId: orgA.id,
        userId: userA.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-1" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-1",
        orgId: orgA.id,
        type: "client.created",
        payload: createClientCreatedPayload(),
        timestamp: new Date().toISOString(),
      },
      { runRequester },
    );

    expect(result.startedExecutionIds).toHaveLength(1);
    expect(result.ignoredWorkflowIds).toHaveLength(0);
    expect(result.erroredWorkflowIds).toHaveLength(0);
    expect(runRequester).toHaveBeenCalledTimes(1);

    await setTestOrgContext(db, orgA.id);
    const executionId = result.startedExecutionIds[0]!;
    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, executionId))
      .limit(1);

    expect(execution).toBeDefined();
    expect(execution!.workflowId).toBe(workflow.id);
    expect(execution!.status).toBe("running");
    expect(execution!.triggerType).toBe("domain_event");
    expect(execution!.triggerEventType).toBe("client.created");
    expect(execution!.triggerEventId).toBe("event-client-created-1");
    expect(execution!.correlationKey).toBe(
      "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    );
    expect(execution!.workflowRunId).toBe("run-event-1");
  });

  test("does not start disabled workflows", async () => {
    await workflowService.create(
      {
        name: "Disabled Client Workflow",
        graph: createGraphWithDomainEventTrigger(["client.created"]),
        isEnabled: false,
      },
      {
        orgId: orgA.id,
        userId: userA.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-disabled" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-disabled-1",
        orgId: orgA.id,
        type: "client.created",
        payload: createClientCreatedPayload(),
        timestamp: new Date().toISOString(),
      },
      { runRequester },
    );

    expect(result.startedExecutionIds).toHaveLength(0);
    expect(result.ignoredWorkflowIds).toHaveLength(0);
    expect(result.erroredWorkflowIds).toHaveLength(0);
    expect(runRequester).toHaveBeenCalledTimes(0);
  });

  test("ignores workflows without matching start routing", async () => {
    await workflowService.create(
      {
        name: "Appointment Workflow",
        graph: createGraphWithDomainEventTrigger(["appointment.created"]),
        isEnabled: true,
      },
      {
        orgId: orgA.id,
        userId: userA.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-unused" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-2",
        orgId: orgA.id,
        type: "client.created",
        payload: createClientCreatedPayload(),
        timestamp: new Date().toISOString(),
      },
      { runRequester },
    );

    expect(result.startedExecutionIds).toHaveLength(0);
    expect(result.ignoredWorkflowIds).toHaveLength(1);
    expect(result.erroredWorkflowIds).toHaveLength(0);
    expect(runRequester).toHaveBeenCalledTimes(0);
  });

  test("continues processing other workflows when one enqueue fails", async () => {
    const [firstWorkflow, secondWorkflow] = await Promise.all([
      workflowService.create(
        {
          name: "First Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
          isEnabled: true,
        },
        {
          orgId: orgA.id,
          userId: userA.id,
        },
      ),
      workflowService.create(
        {
          name: "Second Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
          isEnabled: true,
        },
        {
          orgId: orgA.id,
          userId: userA.id,
        },
      ),
    ]);

    let callCount = 0;
    const runRequester = mock(async () => {
      callCount += 1;

      if (callCount === 1) {
        throw new Error("enqueue failed");
      }

      return { eventId: "run-event-success" };
    });

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-3",
        orgId: orgA.id,
        type: "client.created",
        payload: createClientCreatedPayload(),
        timestamp: new Date().toISOString(),
      },
      { runRequester },
    );

    expect(result.startedExecutionIds).toHaveLength(1);
    expect(result.ignoredWorkflowIds).toHaveLength(0);
    expect(result.erroredWorkflowIds).toHaveLength(1);
    expect(runRequester).toHaveBeenCalledTimes(2);

    await setTestOrgContext(db, orgA.id);
    const executions = await db
      .select()
      .from(workflowExecutions)
      .where(
        inArray(workflowExecutions.workflowId, [
          firstWorkflow.id,
          secondWorkflow.id,
        ]),
      );

    const workflowIds = [firstWorkflow.id, secondWorkflow.id];
    expect(workflowIds).toContain(result.erroredWorkflowIds[0]!);

    const erroredExecution = executions.find(
      (execution: (typeof executions)[number]) =>
        execution.workflowId === result.erroredWorkflowIds[0],
    );
    const startedExecution = executions.find(
      (execution: (typeof executions)[number]) =>
        execution.workflowId !== result.erroredWorkflowIds[0],
    );

    expect(erroredExecution).toBeDefined();
    expect(erroredExecution?.status).toBe("error");
    expect(erroredExecution?.error).toBe("enqueue failed");
    expect(startedExecution).toBeDefined();
    expect(startedExecution?.status).toBe("running");
    expect(startedExecution?.workflowRunId).toBe("run-event-success");
  });

  test("only starts workflows in the event org", async () => {
    const [workflowA, workflowB] = await Promise.all([
      workflowService.create(
        {
          name: "Org A Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
          isEnabled: true,
        },
        {
          orgId: orgA.id,
          userId: userA.id,
        },
      ),
      workflowService.create(
        {
          name: "Org B Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
          isEnabled: true,
        },
        {
          orgId: orgB.id,
          userId: userB.id,
        },
      ),
    ]);

    const runRequester = mock(async () => ({ eventId: "run-event-org-a" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-org-a",
        orgId: orgA.id,
        type: "client.created",
        payload: createClientCreatedPayload(),
        timestamp: new Date().toISOString(),
      },
      { runRequester },
    );

    expect(result.startedExecutionIds).toHaveLength(1);
    expect(result.erroredWorkflowIds).toHaveLength(0);
    expect(runRequester).toHaveBeenCalledTimes(1);

    await setTestOrgContext(db, orgA.id);
    const orgAExecutions = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowA.id));

    expect(orgAExecutions).toHaveLength(1);
    expect(orgAExecutions[0]?.workflowRunId).toBe("run-event-org-a");

    await setTestOrgContext(db, orgB.id);
    const orgBExecutions = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowB.id));

    expect(orgBExecutions).toHaveLength(0);
  });

  test("restart routing cancels waiting executions and starts a replacement run", async () => {
    const workflow = await workflowService.create(
      {
        name: "Restart Workflow",
        graph: createGraphWithDomainEventTrigger([], ["client.updated"]),
        isEnabled: true,
      },
      {
        orgId: orgA.id,
        userId: userA.id,
      },
    );

    await setTestOrgContext(db, orgA.id);
    const [existingExecution] = await db
      .insert(workflowExecutions)
      .values({
        orgId: orgA.id,
        workflowId: workflow.id,
        status: "waiting",
        triggerType: "domain_event",
        triggerEventType: "client.created",
        correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      })
      .returning();

    await db.insert(workflowWaitStates).values({
      orgId: orgA.id,
      workflowId: workflow.id,
      executionId: existingExecution!.id,
      runId: "run_wait_1",
      nodeId: "wait-node-1",
      nodeName: "Wait for client updates",
      waitType: "time",
      status: "waiting",
      correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    });

    const runRequester = mock(async () => ({ eventId: "run-event-restart" }));
    const cancelRequester = mock(async () => ({ eventId: "cancel-event-1" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-updated-1",
        orgId: orgA.id,
        type: "client.updated",
        payload: createClientUpdatedPayload(),
        timestamp: new Date().toISOString(),
      },
      {
        runRequester,
        cancelRequester,
      },
    );

    expect(result.startedExecutionIds).toHaveLength(1);
    expect(result.erroredWorkflowIds).toHaveLength(0);
    expect(cancelRequester).toHaveBeenCalledTimes(1);
    expect(runRequester).toHaveBeenCalledTimes(1);

    const [cancelledExecution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, existingExecution!.id));

    expect(cancelledExecution?.status).toBe("cancelled");

    const [waitState] = await db
      .select()
      .from(workflowWaitStates)
      .where(eq(workflowWaitStates.executionId, existingExecution!.id));

    expect(waitState?.status).toBe("cancelled");
  });

  test("ignores duplicate domain events by event id per workflow", async () => {
    await workflowService.create(
      {
        name: "Dedupe Workflow",
        graph: createGraphWithDomainEventTrigger(["client.created"]),
        isEnabled: true,
      },
      {
        orgId: orgA.id,
        userId: userA.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-dedupe-1" }));

    const event = {
      id: "event-client-created-dedupe-1",
      orgId: orgA.id,
      type: "client.created" as const,
      payload: createClientCreatedPayload(),
      timestamp: new Date().toISOString(),
    };

    const first = await processWorkflowDomainEvent(event, { runRequester });
    const second = await processWorkflowDomainEvent(event, { runRequester });

    expect(first.startedExecutionIds).toHaveLength(1);
    expect(second.startedExecutionIds).toHaveLength(0);
    expect(second.ignoredWorkflowIds).toHaveLength(1);
    expect(second.erroredWorkflowIds).toHaveLength(0);
    expect(second.ignored).toHaveLength(1);
    expect(second.ignored?.[0]?.workflowId).toBe(second.ignoredWorkflowIds[0]);
    expect(second.ignored?.[0]?.reason).toBe("duplicate_event");
    expect(runRequester).toHaveBeenCalledTimes(1);

    await setTestOrgContext(db, orgA.id);
    const executions = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.orgId, orgA.id));
    expect(executions).toHaveLength(1);
    expect(executions[0]?.triggerEventId).toBe(event.id);
  });
});
