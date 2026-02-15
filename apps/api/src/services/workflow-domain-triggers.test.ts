import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { workflowExecutions, workflowWaitStates } from "@scheduling/db/schema";
import type {
  DomainEventData,
  DomainEventType,
  SerializedWorkflowGraph,
} from "@scheduling/dto";
import {
  closeTestDb,
  createTestDb,
  resetTestDb,
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
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
    },
  };
}

describe("workflow domain triggers", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  test("starts execution and enqueues workflow run for matching domain event", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Workflow Trigger Org",
    });

    const workflow = await workflowService.create(
      {
        name: "Client Workflow",
        graph: createGraphWithDomainEventTrigger(["client.created"]),
      },
      {
        orgId: org.id,
        userId: user.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-1" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-1",
        orgId: org.id,
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

    await setTestOrgContext(db, org.id);
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

  test("ignores workflows without matching start routing", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Workflow Ignore Org",
      email: "ignore-org@example.com",
    });

    await workflowService.create(
      {
        name: "Appointment Workflow",
        graph: createGraphWithDomainEventTrigger(["appointment.created"]),
      },
      {
        orgId: org.id,
        userId: user.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-unused" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-created-2",
        orgId: org.id,
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
    const { org, user } = await createOrg(db as any, {
      name: "Workflow Partial Failure Org",
      email: "partial-failure@example.com",
    });

    const [firstWorkflow, secondWorkflow] = await Promise.all([
      workflowService.create(
        {
          name: "First Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
        },
        {
          orgId: org.id,
          userId: user.id,
        },
      ),
      workflowService.create(
        {
          name: "Second Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
        },
        {
          orgId: org.id,
          userId: user.id,
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
        orgId: org.id,
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

    await setTestOrgContext(db, org.id);
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
      (execution) => execution.workflowId === result.erroredWorkflowIds[0],
    );
    const startedExecution = executions.find(
      (execution) => execution.workflowId !== result.erroredWorkflowIds[0],
    );

    expect(erroredExecution).toBeDefined();
    expect(erroredExecution?.status).toBe("error");
    expect(erroredExecution?.error).toBe("enqueue failed");
    expect(startedExecution).toBeDefined();
    expect(startedExecution?.status).toBe("running");
    expect(startedExecution?.workflowRunId).toBe("run-event-success");
  });

  test("only starts workflows in the event org", async () => {
    const { org: orgA, user: userA } = await createOrg(db as any, {
      name: "Workflow Org A",
      email: "workflow-org-a@example.com",
    });
    const { org: orgB, user: userB } = await createOrg(db as any, {
      name: "Workflow Org B",
      email: "workflow-org-b@example.com",
    });

    const [workflowA, workflowB] = await Promise.all([
      workflowService.create(
        {
          name: "Org A Workflow",
          graph: createGraphWithDomainEventTrigger(["client.created"]),
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
    const { org, user } = await createOrg(db as any, {
      name: "Workflow Restart Org",
      email: "restart-org@example.com",
    });

    const workflow = await workflowService.create(
      {
        name: "Restart Workflow",
        graph: createGraphWithDomainEventTrigger([], ["client.updated"]),
      },
      {
        orgId: org.id,
        userId: user.id,
      },
    );

    await setTestOrgContext(db, org.id);
    const [existingExecution] = await db
      .insert(workflowExecutions)
      .values({
        orgId: org.id,
        workflowId: workflow.id,
        status: "waiting",
        triggerType: "domain_event",
        triggerEventType: "client.created",
        correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      })
      .returning();

    await db.insert(workflowWaitStates).values({
      orgId: org.id,
      workflowId: workflow.id,
      executionId: existingExecution!.id,
      runId: "run_wait_1",
      nodeId: "wait-node-1",
      nodeName: "Wait for client updates",
      waitType: "hook",
      status: "waiting",
      hookToken: "token_wait_1",
      correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      metadata: { waitForEvents: "client.updated" },
    });

    const runRequester = mock(async () => ({ eventId: "run-event-restart" }));
    const cancelRequester = mock(async () => ({ eventId: "cancel-event-1" }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-updated-1",
        orgId: org.id,
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

  test("start routing resumes matching wait states without creating a new execution", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Workflow Resume Org",
      email: "resume-org@example.com",
    });

    const workflow = await workflowService.create(
      {
        name: "Resume Workflow",
        graph: createGraphWithDomainEventTrigger(["client.updated"]),
      },
      {
        orgId: org.id,
        userId: user.id,
      },
    );

    await setTestOrgContext(db, org.id);
    const [existingExecution] = await db
      .insert(workflowExecutions)
      .values({
        orgId: org.id,
        workflowId: workflow.id,
        status: "waiting",
        triggerType: "domain_event",
        triggerEventType: "client.created",
        correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      })
      .returning();

    const [waitState] = await db
      .insert(workflowWaitStates)
      .values({
        orgId: org.id,
        workflowId: workflow.id,
        executionId: existingExecution!.id,
        runId: "run_wait_resume_1",
        nodeId: "wait-node-2",
        nodeName: "Wait for client updates",
        waitType: "hook",
        status: "waiting",
        hookToken: "token_wait_resume_1",
        correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
        metadata: { waitForEvents: "client.updated" },
      })
      .returning();

    const runRequester = mock(async () => ({ eventId: "run-event-unused" }));
    const waitSignalRequester = mock(async () => ({
      eventId: "signal-event-1",
    }));

    const result = await processWorkflowDomainEvent(
      {
        id: "event-client-updated-2",
        orgId: org.id,
        type: "client.updated",
        payload: createClientUpdatedPayload(),
        timestamp: new Date().toISOString(),
      },
      {
        runRequester,
        waitSignalRequester,
      },
    );

    expect(result.startedExecutionIds).toHaveLength(0);
    expect(result.resumedWorkflowIds).toEqual([workflow.id]);
    expect(runRequester).toHaveBeenCalledTimes(0);
    expect(waitSignalRequester).toHaveBeenCalledTimes(1);

    const [updatedWaitState] = await db
      .select()
      .from(workflowWaitStates)
      .where(eq(workflowWaitStates.id, waitState!.id));

    expect(updatedWaitState?.status).toBe("resumed");

    const [updatedExecution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, existingExecution!.id));

    expect(updatedExecution?.status).toBe("running");
  });

  test("ignores duplicate domain events by event id per workflow", async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Workflow Dedupe Org",
      email: "dedupe-org@example.com",
    });

    await workflowService.create(
      {
        name: "Dedupe Workflow",
        graph: createGraphWithDomainEventTrigger(["client.created"]),
      },
      {
        orgId: org.id,
        userId: user.id,
      },
    );

    const runRequester = mock(async () => ({ eventId: "run-event-dedupe-1" }));

    const event = {
      id: "event-client-created-dedupe-1",
      orgId: org.id,
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

    await setTestOrgContext(db, org.id);
    const executions = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.orgId, org.id));
    expect(executions).toHaveLength(1);
    expect(executions[0]?.triggerEventId).toBe(event.id);
  });
});
