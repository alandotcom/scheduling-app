import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  workflowExecutionEvents,
  workflowExecutionLogs,
  workflowExecutions,
  workflowWaitStates,
} from "@scheduling/db/schema";
import type { SerializedWorkflowGraph } from "@scheduling/dto";
import { withOrg } from "../lib/db.js";
import { workflowRepository } from "../repositories/workflows.js";
import {
  getTestDb,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import { createOrg } from "../test-utils/factories.js";
import { executeWorkflowRunRequested } from "./workflow-run-requested.js";
import { workflowService } from "./workflows.js";

function createConditionGraph(
  condition = "Client.data.firstName === 'Ada'",
): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Webhook",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "condition-node",
        attributes: {
          id: "condition-node",
          type: "action",
          position: { x: 320, y: 0 },
          data: {
            type: "action",
            label: "Condition",
            config: {
              actionType: "condition",
              condition,
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-1",
        source: "trigger-node",
        target: "condition-node",
        undirected: false,
        attributes: {
          id: "edge-1",
          source: "trigger-node",
          target: "condition-node",
        },
      },
    ],
  };
}

function createHttpLoggerGraph(endpoint: string): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Webhook",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "http-node",
        attributes: {
          id: "http-node",
          type: "action",
          position: { x: 280, y: 0 },
          data: {
            type: "action",
            label: "Http Request",
            config: {
              actionType: "http-request",
              httpMethod: "POST",
              endpoint,
              httpHeaders: '{"x-source":"workflow-test"}',
              httpBody: '{"firstName":"@Client.data.firstName"}',
            },
          },
        },
      },
      {
        key: "logger-node",
        attributes: {
          id: "logger-node",
          type: "action",
          position: { x: 560, y: 0 },
          data: {
            type: "action",
            label: "Logger",
            config: {
              actionType: "logger",
              message: "Sent request for @Client.data.firstName",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-trigger-http",
        source: "trigger-node",
        target: "http-node",
        undirected: false,
        attributes: {
          id: "edge-trigger-http",
          source: "trigger-node",
          target: "http-node",
        },
      },
      {
        key: "edge-http-logger",
        source: "http-node",
        target: "logger-node",
        undirected: false,
        attributes: {
          id: "edge-http-logger",
          source: "http-node",
          target: "logger-node",
        },
      },
    ],
  };
}

function createWaitGraph(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Webhook",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action",
          position: { x: 320, y: 0 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: "5s",
              waitGateMode: "off",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-1",
        source: "trigger-node",
        target: "wait-node",
        undirected: false,
        attributes: {
          id: "edge-1",
          source: "trigger-node",
          target: "wait-node",
        },
      },
    ],
  };
}

function createWaitLoggerGraph(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Webhook",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action",
          position: { x: 320, y: 0 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: "5s",
              waitGateMode: "off",
            },
          },
        },
      },
      {
        key: "logger-node",
        attributes: {
          id: "logger-node",
          type: "action",
          position: { x: 640, y: 0 },
          data: {
            type: "action",
            label: "Log event",
            config: {
              actionType: "logger",
              message: "Resumed run for @Client.data.firstName",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-trigger-wait",
        source: "trigger-node",
        target: "wait-node",
        undirected: false,
        attributes: {
          id: "edge-trigger-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "edge-wait-logger",
        source: "wait-node",
        target: "logger-node",
        undirected: false,
        attributes: {
          id: "edge-wait-logger",
          source: "wait-node",
          target: "logger-node",
        },
      },
    ],
  };
}

function createParallelWaitLoggerGraph(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Webhook",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action",
          position: { x: 320, y: 0 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: "5s",
              waitGateMode: "off",
            },
          },
        },
      },
      {
        key: "logger-node",
        attributes: {
          id: "logger-node",
          type: "action",
          position: { x: 320, y: 160 },
          data: {
            type: "action",
            label: "Log Event",
            config: {
              actionType: "logger",
              message: "Parallel branch logger",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-trigger-wait",
        source: "trigger-node",
        target: "wait-node",
        undirected: false,
        attributes: {
          id: "edge-trigger-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "edge-trigger-logger",
        source: "trigger-node",
        target: "logger-node",
        undirected: false,
        attributes: {
          id: "edge-trigger-logger",
          source: "trigger-node",
          target: "logger-node",
        },
      },
    ],
  };
}

describe("workflow run requested service", () => {
  const db: TestDatabase = getTestDb();

  let orgId = "";
  let userId = "";

  beforeEach(async () => {
    const created = await createOrg(db as any, {
      name: "Workflow Run Requested Org",
      email: `workflow-run-requested-${Date.now()}@example.com`,
    });

    orgId = created.org.id;
    userId = created.user.id;
  });

  test("executes trigger and action nodes and stores logs/events", async () => {
    const workflow = await workflowService.create(
      {
        name: "Condition Workflow",
        graph: createConditionGraph(),
        isEnabled: true,
      },
      { orgId, userId },
    );

    const execution = await withOrg(orgId, async (tx) =>
      workflowRepository.createExecution(tx, orgId, {
        workflowId: workflow.id,
        status: "running",
        triggerType: "manual",
        isDryRun: false,
        triggerEventType: "client.created",
        input: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
        },
      }),
    );

    await executeWorkflowRunRequested(
      {
        orgId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        graph: workflow.graph,
        triggerInput: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
          firstName: "Ada",
        },
        eventContext: {
          eventType: "client.created",
        },
      },
      {
        runStep: async (_stepId, fn) => fn(),
        sleep: async () => {},
      },
    );

    await setTestOrgContext(db, orgId);

    const [storedExecution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, execution.id))
      .limit(1);
    expect(storedExecution?.status).toBe("success");

    const logs = await db
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, execution.id));
    expect(logs.map((log) => log.nodeId).sort()).toEqual([
      "condition-node",
      "trigger-node",
    ]);
    expect(logs.every((log) => log.status === "success")).toBeTrue();

    const events = await db
      .select()
      .from(workflowExecutionEvents)
      .where(eq(workflowExecutionEvents.executionId, execution.id));
    const eventTypes = events.map((event) => event.eventType);
    expect(eventTypes).toContain("run.started");
    expect(eventTypes).toContain("run.completed");
  });

  test("condition false halts downstream branch", async () => {
    const workflow = await workflowService.create(
      {
        name: "Condition Halt Workflow",
        graph: createConditionGraph("Client.data.firstName === 'Grace'"),
        isEnabled: true,
      },
      { orgId, userId },
    );

    const execution = await withOrg(orgId, async (tx) =>
      workflowRepository.createExecution(tx, orgId, {
        workflowId: workflow.id,
        status: "running",
        triggerType: "manual",
        isDryRun: false,
        triggerEventType: "client.created",
        input: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d41",
        },
      }),
    );

    await executeWorkflowRunRequested(
      {
        orgId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        graph: workflow.graph,
        triggerInput: {
          firstName: "Ada",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d41",
        },
        eventContext: {
          eventType: "client.created",
        },
      },
      {
        runStep: async (_stepId, fn) => fn(),
        sleep: async () => {},
      },
    );

    await setTestOrgContext(db, orgId);

    const logs = await db
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, execution.id));
    const conditionLog = logs.find((log) => log.nodeId === "condition-node");
    expect(conditionLog?.status).toBe("success");
    expect(conditionLog?.output).toMatchObject({ passed: false });
  });

  test("http-request and logger actions execute with resolved expressions", async () => {
    let capturedBody: unknown = null;
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }

        capturedBody = await request.json();
        return Response.json({ ok: true, echoed: capturedBody });
      },
    });

    try {
      const workflow = await workflowService.create(
        {
          name: "HTTP Logger Workflow",
          graph: createHttpLoggerGraph(`http://127.0.0.1:${server.port}/hook`),
          isEnabled: true,
        },
        { orgId, userId },
      );

      const execution = await withOrg(orgId, async (tx) =>
        workflowRepository.createExecution(tx, orgId, {
          workflowId: workflow.id,
          status: "running",
          triggerType: "manual",
          isDryRun: false,
          triggerEventType: "client.created",
          input: {
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d51",
          },
        }),
      );

      await executeWorkflowRunRequested(
        {
          orgId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          executionId: execution.id,
          graph: workflow.graph,
          triggerInput: {
            firstName: "Ada",
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d51",
          },
          eventContext: {
            eventType: "client.created",
          },
        },
        {
          runStep: async (_stepId, fn) => fn(),
          sleep: async () => {},
        },
      );

      await setTestOrgContext(db, orgId);

      expect(capturedBody).toMatchObject({ firstName: "Ada" });

      const logs = await db
        .select()
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.executionId, execution.id));

      const httpLog = logs.find((log) => log.nodeId === "http-node");
      expect(httpLog?.status).toBe("success");
      expect(httpLog?.output).toMatchObject({
        status: 200,
        data: { ok: true },
      });

      const loggerLog = logs.find((log) => log.nodeId === "logger-node");
      expect(loggerLog?.status).toBe("success");
      expect(loggerLog?.output).toMatchObject({
        logged: true,
        message: "Sent request for Ada",
      });

      const events = await db
        .select()
        .from(workflowExecutionEvents)
        .where(eq(workflowExecutionEvents.executionId, execution.id));
      expect(events.some((event) => event.eventType === "run.log")).toBeTrue();
    } finally {
      server.stop(true);
    }
  });

  test("wait action records waiting and resumed lifecycle", async () => {
    const workflow = await workflowService.create(
      {
        name: "Wait Workflow",
        graph: createWaitGraph(),
        isEnabled: true,
      },
      { orgId, userId },
    );

    const execution = await withOrg(orgId, async (tx) =>
      workflowRepository.createExecution(tx, orgId, {
        workflowId: workflow.id,
        status: "running",
        triggerType: "manual",
        isDryRun: false,
        triggerEventType: "client.created",
        input: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        },
      }),
    );

    await executeWorkflowRunRequested(
      {
        orgId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        graph: workflow.graph,
        triggerInput: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        },
        eventContext: {
          eventType: "client.created",
          correlationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        },
      },
      {
        runStep: async (_stepId, fn) => fn(),
        sleep: async () => {},
      },
    );

    await setTestOrgContext(db, orgId);

    const [storedExecution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, execution.id))
      .limit(1);
    expect(storedExecution?.status).toBe("success");

    const waitStates = await db
      .select()
      .from(workflowWaitStates)
      .where(eq(workflowWaitStates.executionId, execution.id));
    expect(waitStates).toHaveLength(1);
    expect(waitStates[0]?.status).toBe("resumed");

    const events = await db
      .select()
      .from(workflowExecutionEvents)
      .where(eq(workflowExecutionEvents.executionId, execution.id));
    const eventTypes = events.map((event) => event.eventType);
    expect(eventTypes).toContain("run.waiting");
    expect(eventTypes).toContain("run.resumed");
    expect(eventTypes).toContain("run.completed");
  });

  test("wait action calls sleep outside runStep callback", async () => {
    const workflow = await workflowService.create(
      {
        name: "Wait Nested Step Guard Workflow",
        graph: createWaitGraph(),
        isEnabled: true,
      },
      { orgId, userId },
    );

    const execution = await withOrg(orgId, async (tx) =>
      workflowRepository.createExecution(tx, orgId, {
        workflowId: workflow.id,
        status: "running",
        triggerType: "manual",
        isDryRun: false,
        triggerEventType: "client.created",
        input: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
        },
      }),
    );

    let isInRunStep = false;
    let sleepCalled = false;

    await executeWorkflowRunRequested(
      {
        orgId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        graph: workflow.graph,
        triggerInput: {
          firstName: "Ada",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
        },
        eventContext: {
          eventType: "client.created",
        },
      },
      {
        runStep: async (_stepId, fn) => {
          isInRunStep = true;
          try {
            return await fn();
          } finally {
            isInRunStep = false;
          }
        },
        sleep: async () => {
          if (isInRunStep) {
            throw new Error("sleep called inside runStep");
          }

          sleepCalled = true;
        },
      },
    );

    expect(sleepCalled).toBeTrue();
  });

  test("resumed wait execution continues to downstream logger without duplicate wait logs", async () => {
    const workflow = await workflowService.create(
      {
        name: "Wait Logger Workflow",
        graph: createWaitLoggerGraph(),
        isEnabled: true,
      },
      { orgId, userId },
    );

    const execution = await withOrg(orgId, async (tx) => {
      const createdExecution = await workflowRepository.createExecution(
        tx,
        orgId,
        {
          workflowId: workflow.id,
          status: "waiting",
          triggerType: "manual",
          isDryRun: false,
          triggerEventType: "client.created",
          input: {
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d62",
            firstName: "Ada",
          },
        },
      );

      const triggerLog = await workflowRepository.createExecutionLog(
        tx,
        orgId,
        {
          executionId: createdExecution.id,
          nodeId: "trigger-node",
          nodeName: "Webhook",
          nodeType: "trigger",
          status: "running",
        },
      );

      await workflowRepository.completeExecutionLog(
        tx,
        orgId,
        createdExecution.id,
        {
          logId: triggerLog.id,
          status: "success",
          output: {
            accepted: true,
            eventType: "client.created",
            data: {
              firstName: "Ada",
            },
          },
        },
      );

      await workflowRepository.createExecutionLog(tx, orgId, {
        executionId: createdExecution.id,
        nodeId: "wait-node",
        nodeName: "Wait",
        nodeType: "wait",
        status: "running",
      });

      await workflowRepository.createWaitState(tx, orgId, {
        executionId: createdExecution.id,
        workflowId: workflow.id,
        runId: createdExecution.id,
        nodeId: "wait-node",
        nodeName: "Wait",
        waitType: "delay",
        status: "waiting",
        waitUntil: new Date(Date.now() - 1000),
      });

      return createdExecution;
    });

    await executeWorkflowRunRequested(
      {
        orgId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        graph: workflow.graph,
        triggerInput: {
          firstName: "Ada",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d62",
        },
        eventContext: {
          eventType: "client.created",
        },
      },
      {
        runStep: async (_stepId, fn) => fn(),
        sleep: async () => {},
      },
    );

    await setTestOrgContext(db, orgId);

    const [storedExecution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, execution.id))
      .limit(1);
    expect(storedExecution?.status).toBe("success");

    const logs = await db
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, execution.id));

    const waitLogs = logs.filter((log) => log.nodeId === "wait-node");
    expect(waitLogs).toHaveLength(1);
    expect(waitLogs[0]?.status).toBe("success");

    const loggerLog = logs.find((log) => log.nodeId === "logger-node");
    expect(loggerLog?.status).toBe("success");

    const events = await db
      .select()
      .from(workflowExecutionEvents)
      .where(eq(workflowExecutionEvents.executionId, execution.id));
    expect(events.some((event) => event.eventType === "run.log")).toBeTrue();
  });

  test("parallel branch logger executes without waiting for wait node", async () => {
    const workflow = await workflowService.create(
      {
        name: "Parallel Wait Logger Workflow",
        graph: createParallelWaitLoggerGraph(),
        isEnabled: true,
      },
      { orgId, userId },
    );

    const execution = await withOrg(orgId, async (tx) =>
      workflowRepository.createExecution(tx, orgId, {
        workflowId: workflow.id,
        status: "running",
        triggerType: "manual",
        isDryRun: false,
        triggerEventType: "client.created",
        input: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d72",
        },
      }),
    );

    const stepTrace: string[] = [];
    let loggerStepSeenBeforeSleep = false;

    await executeWorkflowRunRequested(
      {
        orgId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        executionId: execution.id,
        graph: workflow.graph,
        triggerInput: {
          firstName: "Ada",
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d72",
        },
        eventContext: {
          eventType: "client.created",
        },
      },
      {
        runStep: async (stepId, fn) => {
          stepTrace.push(`run:${stepId}`);
          if (stepId.includes("node-log-event-logger-node")) {
            loggerStepSeenBeforeSleep = true;
          }

          return fn();
        },
        sleep: async () => {
          expect(loggerStepSeenBeforeSleep).toBeTrue();
          stepTrace.push("sleep");
          await new Promise((resolve) => setTimeout(resolve, 25));
        },
      },
    );

    await setTestOrgContext(db, orgId);

    const logs = await db
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, execution.id));

    const loggerLog = logs.find((log) => log.nodeId === "logger-node");
    const waitLog = logs.find((log) => log.nodeId === "wait-node");

    expect(loggerLog?.status).toBe("success");
    expect(waitLog?.status).toBe("success");
    expect(loggerLog?.completedAt?.getTime() ?? 0).toBeLessThanOrEqual(
      waitLog?.completedAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
    );

    expect(
      stepTrace.some((entry) => entry.includes("node-log-event-logger-node")),
    ).toBeTrue();
    expect(
      stepTrace.some((entry) => entry.includes("node-wait-wait-node")),
    ).toBeTrue();
  });
});
