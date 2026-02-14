import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { workflowExecutions } from "@scheduling/db/schema";
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
              restartEvents: [],
              stopEvents: [],
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
      runRequester,
    );

    expect(result.startedExecutionIds).toHaveLength(1);
    expect(result.ignoredWorkflowIds).toHaveLength(0);
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
      runRequester,
    );

    expect(result.startedExecutionIds).toHaveLength(0);
    expect(result.ignoredWorkflowIds).toHaveLength(1);
    expect(runRequester).toHaveBeenCalledTimes(0);
  });
});
