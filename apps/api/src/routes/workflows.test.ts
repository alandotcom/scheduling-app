import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { SerializedWorkflowGraph } from "@scheduling/dto";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import {
  clients,
  workflowExecutionEvents,
  workflowExecutionLogs,
  workflowExecutions,
  workflowWaitStates,
  workflows,
} from "@scheduling/db/schema";
import { inngest } from "../inngest/client.js";
import {
  createOrg,
  createOrgMember,
  createTestContext,
  getTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as workflowRoutes from "./workflows.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

function createTestGraph(triggerId = "trigger-1"): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
          },
        },
      },
    ],
    edges: [],
  };
}

function createGraphWithIntegrationConfig(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-source",
        attributes: {
          id: "trigger-source",
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            status: "running",
            config: {
              triggerType: "DomainEvent",
              domain: "appointment",
              startEvents: ["appointment.scheduled"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "action-source",
        attributes: {
          id: "action-source",
          type: "action-node",
          position: {
            x: 100,
            y: 80,
          },
          data: {
            label: "Action",
            type: "action",
            status: "success",
            config: {
              integrationId: "integration-1",
              operation: "send_email",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-source",
        source: "trigger-source",
        target: "action-source",
        attributes: {
          id: "edge-source",
          source: "trigger-source",
          target: "action-source",
        },
      },
    ],
  };
}

function createGraphWithDomainTrigger(
  eventType: "client.created" | "client.updated" | "client.deleted",
): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-source",
        attributes: {
          id: "trigger-source",
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: [eventType],
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

function createBranchingGraph(): SerializedWorkflowGraph {
  return {
    nodes: [
      {
        key: "trigger-branch",
        attributes: {
          id: "trigger-branch",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            label: "Trigger",
            type: "trigger",
          },
        },
      },
      {
        key: "logger-branch-a",
        attributes: {
          id: "logger-branch-a",
          type: "action-node",
          position: { x: 220, y: -80 },
          data: {
            label: "Logger A",
            type: "action",
            config: {
              actionType: "logger",
              message: "A",
            },
          },
        },
      },
      {
        key: "logger-branch-b",
        attributes: {
          id: "logger-branch-b",
          type: "action-node",
          position: { x: 220, y: 80 },
          data: {
            label: "Logger B",
            type: "action",
            config: {
              actionType: "logger",
              message: "B",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-branch-a",
        source: "trigger-branch",
        target: "logger-branch-a",
        attributes: {
          id: "edge-branch-a",
          source: "trigger-branch",
          target: "logger-branch-a",
        },
      },
      {
        key: "edge-branch-b",
        source: "trigger-branch",
        target: "logger-branch-b",
        attributes: {
          id: "edge-branch-b",
          source: "trigger-branch",
          target: "logger-branch-b",
        },
      },
    ],
  };
}

async function seedExecutionArtifacts(input: {
  db: Database;
  orgId: string;
  workflowId: string;
  status?: "running" | "waiting" | "cancelled" | "success";
  startedAt?: Date;
}): Promise<{ executionId: string }> {
  const startedAt = input.startedAt ?? new Date();
  await setTestOrgContext(input.db, input.orgId);
  const [execution] = await input.db
    .insert(workflowExecutions)
    .values({
      orgId: input.orgId,
      workflowId: input.workflowId,
      status: input.status ?? "running",
      triggerType: "domain_event",
      triggerEventType: "appointment.scheduled",
      startedAt,
    })
    .returning({ id: workflowExecutions.id });

  return { executionId: execution!.id };
}

describe("Workflow Routes", () => {
  const db = getTestDb() as Database;
  const originalInngestSend = inngest.send.bind(inngest);

  let orgA: { id: string };
  let ownerA: { id: string };
  let memberA: { id: string };
  let orgB: { id: string };
  let ownerB: { id: string };
  let ownerContext: ReturnType<typeof createTestContext>;
  let memberContext: ReturnType<typeof createTestContext>;
  let contextA: ReturnType<typeof createTestContext>;
  let contextB: ReturnType<typeof createTestContext>;

  beforeEach(async () => {
    (inngest as unknown as { send: typeof inngest.send }).send = mock(
      async () => ({ ids: ["cancel-event-id"] }),
    );

    const primaryResult = await createOrg(db, { name: "Primary Org" });
    orgA = primaryResult.org;
    ownerA = primaryResult.user;
    memberA = await createOrgMember(db, orgA.id, {
      role: "member",
      email: "member@primary.org",
    });

    const secondaryResult = await createOrg(db, {
      name: "Secondary Org",
      email: "owner-b@org.test",
    });
    orgB = secondaryResult.org;
    ownerB = secondaryResult.user;

    ownerContext = createTestContext({
      orgId: orgA.id,
      userId: ownerA.id,
      role: "owner",
    });
    memberContext = createTestContext({
      orgId: orgA.id,
      userId: memberA.id,
      role: "member",
    });
    contextA = ownerContext;
    contextB = createTestContext({
      orgId: orgB.id,
      userId: ownerB.id,
      role: "owner",
    });
  });

  afterAll(async () => {
    (inngest as unknown as { send: typeof inngest.send }).send =
      originalInngestSend;
  });

  test("member can list and get workflows in their org", async () => {
    const created = await call(
      workflowRoutes.create,
      {
        name: "Patient Onboarding",
        graph: createTestGraph("trigger-member-read"),
      },
      { context: ownerContext },
    );

    const listed = await call(workflowRoutes.list, undefined as never, {
      context: memberContext,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(created.id);
    expect(listed[0]!.isOwner).toBeFalse();

    const fetched = await call(
      workflowRoutes.get,
      { id: created.id },
      { context: memberContext },
    );
    expect(fetched.id).toBe(created.id);
    expect(fetched.isOwner).toBeFalse();
  });

  test("member cannot create, update, or delete workflows", async () => {
    const created = await call(
      workflowRoutes.create,
      {
        name: "Owner Created Workflow",
        graph: createTestGraph("trigger-owner-created"),
      },
      { context: ownerContext },
    );

    await expect(
      call(
        workflowRoutes.create,
        {
          name: "Member Should Not Create",
          graph: createTestGraph("trigger-member-create"),
        },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        workflowRoutes.update,
        { id: created.id, data: { name: "Forbidden Rename" } },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        workflowRoutes.remove,
        { id: created.id },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("admin can create, update, and delete workflows", async () => {
    const created = await call(
      workflowRoutes.create,
      {
        name: "Owner Workflow",
        graph: createTestGraph("trigger-owner-crud"),
      },
      { context: ownerContext },
    );
    expect(created.name).toBe("Owner Workflow");
    expect(created.isEnabled).toBeFalse();
    expect(created.isOwner).toBeTrue();

    const updated = await call(
      workflowRoutes.update,
      {
        id: created.id,
        data: {
          name: "Owner Workflow Updated",
          description: "Updated by owner",
          isEnabled: true,
        },
      },
      { context: ownerContext },
    );
    expect(updated.name).toBe("Owner Workflow Updated");
    expect(updated.description).toBe("Updated by owner");
    expect(updated.isEnabled).toBeTrue();
    expect(updated.isOwner).toBeTrue();

    const removed = await call(
      workflowRoutes.remove,
      { id: created.id },
      { context: ownerContext },
    );
    expect(removed).toEqual({ success: true });
  });

  test("non-linear create payload is rejected with no persistence side effects", async () => {
    await setTestOrgContext(db, orgA.id);
    const beforeRows = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.orgId, orgA.id));

    await expect(
      call(
        workflowRoutes.create,
        {
          name: "Branching Journey",
          graph: createBranchingGraph(),
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await setTestOrgContext(db, orgA.id);
    const afterRows = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.orgId, orgA.id));

    expect(afterRows).toHaveLength(beforeRows.length);
  });

  test("non-linear update payload is rejected with no persistence side effects", async () => {
    const created = await call(
      workflowRoutes.create,
      {
        name: "Linear Workflow",
        graph: createTestGraph("trigger-linear-update"),
      },
      { context: ownerContext },
    );

    await expect(
      call(
        workflowRoutes.update,
        {
          id: created.id,
          data: {
            graph: createBranchingGraph(),
          },
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await setTestOrgContext(db, orgA.id);
    const [persisted] = await db
      .select({ graph: workflows.graph })
      .from(workflows)
      .where(eq(workflows.id, created.id))
      .limit(1);

    expect(persisted).toBeDefined();
    const persistedGraph = persisted!.graph as SerializedWorkflowGraph;
    expect(persistedGraph.edges).toHaveLength(0);
  });

  test("cross-org workflow IDs are isolated for reads and writes", async () => {
    const workflowInOrgB = await call(
      workflowRoutes.create,
      {
        name: "Org B Workflow",
        graph: createTestGraph("trigger-org-b"),
      },
      { context: contextB },
    );

    await expect(
      call(
        workflowRoutes.get,
        { id: workflowInOrgB.id },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.update,
        {
          id: workflowInOrgB.id,
          data: { name: "Cross-org update attempt" },
        },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.remove,
        { id: workflowInOrgB.id },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("duplicate creates a private copied workflow and detects name conflicts", async () => {
    const source = await call(
      workflowRoutes.create,
      {
        name: "Source Workflow",
        description: "To be duplicated",
        graph: createGraphWithIntegrationConfig(),
        visibility: "public",
      },
      { context: ownerContext },
    );

    await expect(
      call(
        workflowRoutes.duplicate,
        { id: source.id },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const duplicated = await call(
      workflowRoutes.duplicate,
      { id: source.id },
      { context: ownerContext },
    );

    expect(duplicated.id).not.toBe(source.id);
    expect(duplicated.name).toBe("Source Workflow (Copy)");
    expect(duplicated.description).toBe("To be duplicated");
    expect(duplicated.isEnabled).toBeFalse();
    expect(duplicated.visibility).toBe("private");
    expect(duplicated.isOwner).toBeTrue();

    const sourceNodeIds = new Set(source.graph.nodes.map((node) => node.key));
    const duplicatedNodeIds = duplicated.graph.nodes.map((node) => node.key);
    expect(duplicatedNodeIds.some((id) => sourceNodeIds.has(id))).toBeFalse();
    for (const node of duplicated.graph.nodes) {
      expect(node.attributes.id).toBe(node.key);
      expect(node.attributes.data.status).toBe("idle");
      if (node.attributes.data.type === "action") {
        const config = node.attributes.data.config ?? {};
        expect("integrationId" in config).toBeFalse();
      }
    }

    expect(duplicated.graph.edges).toHaveLength(1);
    const [duplicatedEdge] = duplicated.graph.edges;
    const duplicatedNodeIdSet = new Set(duplicatedNodeIds);
    expect(duplicatedEdge!.key).not.toBe("edge-source");
    expect(duplicatedNodeIdSet.has(duplicatedEdge!.source)).toBeTrue();
    expect(duplicatedNodeIdSet.has(duplicatedEdge!.target)).toBeTrue();

    await expect(
      call(
        workflowRoutes.duplicate,
        { id: source.id },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await setTestOrgContext(db, orgA.id);
    const allWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.orgId, orgA.id));
    expect(allWorkflows).toHaveLength(2);
  });

  test("lists execution samples from real records based on trigger domain", async () => {
    const workflow = await call(
      workflowRoutes.create,
      {
        name: "Sample Event Workflow",
        graph: createGraphWithDomainTrigger("client.updated"),
      },
      { context: ownerContext },
    );

    await setTestOrgContext(db, orgA.id);
    const [client] = await db
      .insert(clients)
      .values({
        orgId: orgA.id,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: null,
      })
      .returning();

    const samples = await call(
      workflowRoutes.listExecutionSamples,
      { id: workflow.id },
      { context: memberContext },
    );

    expect(samples.samples.length).toBeGreaterThan(0);
    expect(samples.samples[0]?.eventType).toBe("client.updated");
    expect(samples.samples[0]?.recordId).toBe(client!.id);
    expect(samples.samples[0]?.payload).toMatchObject({
      clientId: client!.id,
      firstName: "Ada",
      lastName: "Lovelace",
      previous: {
        clientId: client!.id,
      },
    });
  });

  test("execute runs for admins and is forbidden for members", async () => {
    const workflow = await call(
      workflowRoutes.create,
      {
        name: "Manual Execute Workflow",
        graph: createGraphWithDomainTrigger("client.created"),
        isEnabled: true,
      },
      { context: ownerContext },
    );

    await expect(
      call(
        workflowRoutes.execute,
        {
          id: workflow.id,
          data: {
            eventType: "client.created",
            payload: {
              clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
              firstName: "Ada",
              lastName: "Lovelace",
              email: null,
              phone: null,
            },
            dryRun: true,
          },
        },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await call(
      workflowRoutes.execute,
      {
        id: workflow.id,
        data: {
          eventType: "client.created",
          payload: {
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
            firstName: "Ada",
            lastName: "Lovelace",
            email: null,
            phone: null,
          },
          dryRun: true,
        },
      },
      { context: ownerContext },
    );

    expect(result.status).toBe("running");
    expect(result.dryRun).toBeTrue();

    await setTestOrgContext(db, orgA.id);
    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, result.executionId))
      .limit(1);
    expect(execution?.status).toBe("success");
    expect(execution?.isDryRun).toBeTrue();
    expect(execution?.triggerType).toBe("manual");
  });

  test("member can read execution history/details/logs/events/status", async () => {
    const workflow = await call(
      workflowRoutes.create,
      {
        name: "Execution Workflow",
        graph: createTestGraph("trigger-exec-read"),
      },
      { context: ownerContext },
    );

    const older = await seedExecutionArtifacts({
      db,
      orgId: orgA.id,
      workflowId: workflow.id,
      status: "running",
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
    });
    const newer = await seedExecutionArtifacts({
      db,
      orgId: orgA.id,
      workflowId: workflow.id,
      status: "cancelled",
      startedAt: new Date("2026-01-01T11:00:00.000Z"),
    });

    await setTestOrgContext(db, orgA.id);
    await db.insert(workflowExecutionLogs).values([
      {
        orgId: orgA.id,
        executionId: newer.executionId,
        nodeId: "node-b",
        nodeName: "Node B",
        nodeType: "action-node",
        status: "running",
        timestamp: new Date("2026-01-01T11:01:00.000Z"),
      },
      {
        orgId: orgA.id,
        executionId: newer.executionId,
        nodeId: "node-a",
        nodeName: "Node A",
        nodeType: "action-node",
        status: "success",
        timestamp: new Date("2026-01-01T11:00:00.000Z"),
      },
    ]);

    await db.insert(workflowExecutionEvents).values([
      {
        orgId: orgA.id,
        workflowId: workflow.id,
        executionId: newer.executionId,
        eventType: "run.cancel.requested",
        message: "Cancel requested",
        createdAt: new Date("2026-01-01T11:02:00.000Z"),
      },
      {
        orgId: orgA.id,
        workflowId: workflow.id,
        executionId: newer.executionId,
        eventType: "run.started",
        message: "Run started",
        createdAt: new Date("2026-01-01T11:00:30.000Z"),
      },
    ]);

    const executions = await call(
      workflowRoutes.listExecutions,
      { id: workflow.id, limit: 10 },
      { context: memberContext },
    );
    expect(executions).toHaveLength(2);
    expect(executions[0]!.id).toBe(newer.executionId);
    expect(executions[1]!.id).toBe(older.executionId);

    const execution = await call(
      workflowRoutes.getExecution,
      { executionId: newer.executionId },
      { context: memberContext },
    );
    expect(execution.id).toBe(newer.executionId);

    const logs = await call(
      workflowRoutes.getExecutionLogs,
      { executionId: newer.executionId },
      { context: memberContext },
    );
    expect(logs.execution.id).toBe(newer.executionId);
    expect(logs.logs.map((log) => log.nodeId)).toEqual(["node-b", "node-a"]);

    const events = await call(
      workflowRoutes.getExecutionEvents,
      { executionId: newer.executionId },
      { context: memberContext },
    );
    expect(events.events.map((event) => event.eventType)).toEqual([
      "run.cancel.requested",
      "run.started",
    ]);

    const status = await call(
      workflowRoutes.getExecutionStatus,
      { executionId: newer.executionId },
      { context: memberContext },
    );
    expect(status.status).toBe("cancelled");
    expect(status.nodeStatuses).toEqual([
      { nodeId: "node-b", status: "cancelled" },
      { nodeId: "node-a", status: "success" },
    ]);
  });

  test("execution status endpoint returns latest node status per node", async () => {
    const workflow = await call(
      workflowRoutes.create,
      {
        name: "Execution Status Workflow",
        graph: createTestGraph("trigger-exec-status"),
      },
      { context: ownerContext },
    );

    const seeded = await seedExecutionArtifacts({
      db,
      orgId: orgA.id,
      workflowId: workflow.id,
      status: "running",
      startedAt: new Date("2026-01-02T09:00:00.000Z"),
    });

    await setTestOrgContext(db, orgA.id);
    await db.insert(workflowExecutionLogs).values([
      {
        orgId: orgA.id,
        executionId: seeded.executionId,
        nodeId: "node-a",
        nodeName: "Node A",
        nodeType: "action-node",
        status: "success",
        timestamp: new Date("2026-01-02T09:00:00.000Z"),
      },
      {
        orgId: orgA.id,
        executionId: seeded.executionId,
        nodeId: "node-a",
        nodeName: "Node A",
        nodeType: "action-node",
        status: "running",
        timestamp: new Date("2026-01-02T09:00:30.000Z"),
      },
      {
        orgId: orgA.id,
        executionId: seeded.executionId,
        nodeId: "node-b",
        nodeName: "Node B",
        nodeType: "action-node",
        status: "pending",
        timestamp: new Date("2026-01-02T09:00:10.000Z"),
      },
    ]);

    const status = await call(
      workflowRoutes.getExecutionStatus,
      { executionId: seeded.executionId },
      { context: ownerContext },
    );

    expect(status.status).toBe("running");
    expect(status.nodeStatuses).toEqual([
      { nodeId: "node-a", status: "running" },
      { nodeId: "node-b", status: "pending" },
    ]);
  });

  test("admin can cancel a waiting execution and member cannot", async () => {
    const workflow = await call(
      workflowRoutes.create,
      {
        name: "Cancellation Workflow",
        graph: createTestGraph("trigger-exec-cancel"),
      },
      { context: ownerContext },
    );

    const seeded = await seedExecutionArtifacts({
      db,
      orgId: orgA.id,
      workflowId: workflow.id,
      status: "waiting",
    });

    await setTestOrgContext(db, orgA.id);
    await db.insert(workflowWaitStates).values({
      orgId: orgA.id,
      executionId: seeded.executionId,
      workflowId: workflow.id,
      runId: "run-1",
      nodeId: "wait-node",
      nodeName: "Wait Node",
      waitType: "event",
      status: "waiting",
      hookToken: "token-1",
      correlationKey: "appointment-1",
    });

    await expect(
      call(
        workflowRoutes.cancelExecution,
        { executionId: seeded.executionId },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const cancelled = await call(
      workflowRoutes.cancelExecution,
      { executionId: seeded.executionId },
      { context: ownerContext },
    );

    expect(cancelled).toEqual({
      success: true,
      status: "cancelled",
      cancelledWaitStates: 1,
    });

    const [updatedExecution] = await db
      .select({ status: workflowExecutions.status })
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, seeded.executionId));
    expect(updatedExecution!.status).toBe("cancelled");

    await expect(
      call(
        workflowRoutes.cancelExecution,
        { executionId: seeded.executionId },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("cancel execution surfaces send failure and preserves waiting state", async () => {
    const workflow = await call(
      workflowRoutes.create,
      {
        name: "Cancellation Failure Workflow",
        graph: createTestGraph("trigger-exec-cancel-failure"),
      },
      { context: ownerContext },
    );

    const seeded = await seedExecutionArtifacts({
      db,
      orgId: orgA.id,
      workflowId: workflow.id,
      status: "waiting",
    });

    await setTestOrgContext(db, orgA.id);
    await db.insert(workflowWaitStates).values({
      orgId: orgA.id,
      executionId: seeded.executionId,
      workflowId: workflow.id,
      runId: "run-failure-1",
      nodeId: "wait-node",
      nodeName: "Wait Node",
      waitType: "event",
      status: "waiting",
      hookToken: "token-failure-1",
      correlationKey: "appointment-failure-1",
    });

    (inngest as unknown as { send: typeof inngest.send }).send = mock(
      async () => {
        throw new Error("send failed");
      },
    );

    await expect(
      call(
        workflowRoutes.cancelExecution,
        { executionId: seeded.executionId },
        { context: ownerContext },
      ),
    ).rejects.toThrow("send failed");

    const [execution] = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, seeded.executionId))
      .limit(1);
    expect(execution?.status).toBe("waiting");

    const [waitState] = await db
      .select()
      .from(workflowWaitStates)
      .where(eq(workflowWaitStates.executionId, seeded.executionId))
      .limit(1);
    expect(waitState?.status).toBe("waiting");
  });

  test("execution endpoints enforce org isolation and not found behavior", async () => {
    const workflowInOrgB = await call(
      workflowRoutes.create,
      {
        name: "Org B Execution Workflow",
        graph: createTestGraph("trigger-org-b-exec"),
      },
      { context: contextB },
    );
    const seededInOrgB = await seedExecutionArtifacts({
      db,
      orgId: orgB.id,
      workflowId: workflowInOrgB.id,
      status: "waiting",
    });

    await expect(
      call(
        workflowRoutes.listExecutions,
        { id: workflowInOrgB.id, limit: 5 },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.getExecution,
        { executionId: seededInOrgB.executionId },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.getExecutionLogs,
        { executionId: seededInOrgB.executionId },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.getExecutionEvents,
        { executionId: seededInOrgB.executionId },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.getExecutionStatus,
        { executionId: seededInOrgB.executionId },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.cancelExecution,
        { executionId: seededInOrgB.executionId },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        workflowRoutes.getExecution,
        {
          executionId: "00000000-0000-7000-8000-000000000001",
        },
        { context: contextA },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
