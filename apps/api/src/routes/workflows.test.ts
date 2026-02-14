import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { SerializedWorkflowGraph } from "@scheduling/dto";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import {
  workflowExecutionEvents,
  workflowExecutionLogs,
  workflowExecutions,
  workflowWaitStates,
  workflows,
} from "@scheduling/db/schema";
import { inngest } from "../inngest/client.js";
import {
  closeTestDb,
  createOrg,
  createOrgMember,
  createTestContext,
  createTestDb,
  resetTestDb,
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
              startEvents: ["appointment.created"],
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
      triggerEventType: "appointment.created",
      startedAt,
    })
    .returning({ id: workflowExecutions.id });

  return { executionId: execution!.id };
}

describe("Workflow Routes", () => {
  let db: Database;
  const originalInngestSend = inngest.send.bind(inngest);

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    (inngest as unknown as { send: typeof inngest.send }).send = mock(
      async () => ({ ids: ["cancel-event-id"] }),
    );
  });

  afterAll(async () => {
    (inngest as unknown as { send: typeof inngest.send }).send =
      originalInngestSend;
  });

  test("member can list and get workflows in their org", async () => {
    const { org, user: owner } = await createOrg(db, {
      name: "Primary Org",
    });
    const member = await createOrgMember(db, org.id, {
      role: "member",
      email: "member@primary.org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: member.id,
      role: "member",
    });

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
    const { org, user: owner } = await createOrg(db, {
      name: "Write Guard Org",
    });
    const member = await createOrgMember(db, org.id, {
      role: "member",
      email: "member@write-guard.org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: member.id,
      role: "member",
    });

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
    const { org, user: owner } = await createOrg(db, {
      name: "Admin CRUD Org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.create,
      {
        name: "Owner Workflow",
        graph: createTestGraph("trigger-owner-crud"),
      },
      { context: ownerContext },
    );
    expect(created.name).toBe("Owner Workflow");
    expect(created.isOwner).toBeTrue();

    const updated = await call(
      workflowRoutes.update,
      {
        id: created.id,
        data: {
          name: "Owner Workflow Updated",
          description: "Updated by owner",
        },
      },
      { context: ownerContext },
    );
    expect(updated.name).toBe("Owner Workflow Updated");
    expect(updated.description).toBe("Updated by owner");
    expect(updated.isOwner).toBeTrue();

    const removed = await call(
      workflowRoutes.remove,
      { id: created.id },
      { context: ownerContext },
    );
    expect(removed).toEqual({ success: true });
  });

  test("cross-org workflow IDs are isolated for reads and writes", async () => {
    const { org: orgA, user: ownerA } = await createOrg(db, {
      name: "Org A",
      email: "owner-a@org.test",
    });
    const { org: orgB, user: ownerB } = await createOrg(db, {
      name: "Org B",
      email: "owner-b@org.test",
    });

    const contextA = createTestContext({
      orgId: orgA.id,
      userId: ownerA.id,
      role: "owner",
    });
    const contextB = createTestContext({
      orgId: orgB.id,
      userId: ownerB.id,
      role: "owner",
    });

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

  test("current workflow autosave creates and updates the org draft", async () => {
    const { org, user: owner } = await createOrg(db, {
      name: "Current Workflow Org",
    });
    const member = await createOrgMember(db, org.id, {
      role: "member",
      email: "member@current.org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: member.id,
      role: "member",
    });

    const emptyCurrent = await call(
      workflowRoutes.getCurrent,
      undefined as never,
      {
        context: memberContext,
      },
    );
    expect(emptyCurrent.id).toBeUndefined();
    expect(emptyCurrent.graph.nodes).toHaveLength(0);

    await expect(
      call(
        workflowRoutes.saveCurrent,
        { graph: createTestGraph("forbidden-save") },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const created = await call(
      workflowRoutes.saveCurrent,
      {
        graph: {
          attributes: {},
          options: { type: "directed" },
          nodes: [],
          edges: [],
        },
      },
      { context: ownerContext },
    );
    expect(created.id).toBeDefined();
    expect(created.graph.nodes).toHaveLength(1);

    const updated = await call(
      workflowRoutes.saveCurrent,
      { graph: createTestGraph("updated-current") },
      { context: ownerContext },
    );
    expect(updated.id).toBe(created.id);
    expect(updated.graph.nodes[0]!.key).toBe("updated-current");

    const fetched = await call(workflowRoutes.getCurrent, undefined as never, {
      context: memberContext,
    });
    expect(fetched.id).toBe(created.id);
    expect(fetched.graph.nodes[0]!.key).toBe("updated-current");
  });

  test("duplicate creates a private copied workflow and detects name conflicts", async () => {
    const { org, user: owner } = await createOrg(db, {
      name: "Duplicate Workflow Org",
    });
    const member = await createOrgMember(db, org.id, {
      role: "member",
      email: "member@duplicate.org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: member.id,
      role: "member",
    });

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

    await setTestOrgContext(db, org.id);
    const allWorkflows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.orgId, org.id));
    expect(allWorkflows).toHaveLength(2);
  });

  test("member can read execution history/details/logs/events/status", async () => {
    const { org, user: owner } = await createOrg(db, { name: "Exec Read Org" });
    const member = await createOrgMember(db, org.id, {
      role: "member",
      email: "member@exec-read.org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: member.id,
      role: "member",
    });

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
      orgId: org.id,
      workflowId: workflow.id,
      status: "running",
      startedAt: new Date("2026-01-01T10:00:00.000Z"),
    });
    const newer = await seedExecutionArtifacts({
      db,
      orgId: org.id,
      workflowId: workflow.id,
      status: "cancelled",
      startedAt: new Date("2026-01-01T11:00:00.000Z"),
    });

    await setTestOrgContext(db, org.id);
    await db.insert(workflowExecutionLogs).values([
      {
        orgId: org.id,
        executionId: newer.executionId,
        nodeId: "node-b",
        nodeName: "Node B",
        nodeType: "action-node",
        status: "running",
        timestamp: new Date("2026-01-01T11:01:00.000Z"),
      },
      {
        orgId: org.id,
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
        orgId: org.id,
        workflowId: workflow.id,
        executionId: newer.executionId,
        eventType: "run.cancel_requested",
        message: "Cancel requested",
        createdAt: new Date("2026-01-01T11:02:00.000Z"),
      },
      {
        orgId: org.id,
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
      "run.cancel_requested",
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
    const { org, user: owner } = await createOrg(db, {
      name: "Execution Status Org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

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
      orgId: org.id,
      workflowId: workflow.id,
      status: "running",
      startedAt: new Date("2026-01-02T09:00:00.000Z"),
    });

    await setTestOrgContext(db, org.id);
    await db.insert(workflowExecutionLogs).values([
      {
        orgId: org.id,
        executionId: seeded.executionId,
        nodeId: "node-a",
        nodeName: "Node A",
        nodeType: "action-node",
        status: "success",
        timestamp: new Date("2026-01-02T09:00:00.000Z"),
      },
      {
        orgId: org.id,
        executionId: seeded.executionId,
        nodeId: "node-a",
        nodeName: "Node A",
        nodeType: "action-node",
        status: "running",
        timestamp: new Date("2026-01-02T09:00:30.000Z"),
      },
      {
        orgId: org.id,
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
    const { org, user: owner } = await createOrg(db, {
      name: "Execution Cancel Org",
    });
    const member = await createOrgMember(db, org.id, {
      role: "member",
      email: "member@exec-cancel.org",
    });

    const ownerContext = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: member.id,
      role: "member",
    });

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
      orgId: org.id,
      workflowId: workflow.id,
      status: "waiting",
    });

    await setTestOrgContext(db, org.id);
    await db.insert(workflowWaitStates).values({
      orgId: org.id,
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
  });

  test("execution endpoints enforce org isolation and not found behavior", async () => {
    const { org: orgA, user: ownerA } = await createOrg(db, {
      name: "Execution Org A",
      email: "owner-a@exec-org.test",
    });
    const { org: orgB, user: ownerB } = await createOrg(db, {
      name: "Execution Org B",
      email: "owner-b@exec-org.test",
    });

    const contextA = createTestContext({
      orgId: orgA.id,
      userId: ownerA.id,
      role: "owner",
    });
    const contextB = createTestContext({
      orgId: orgB.id,
      userId: ownerB.id,
      role: "owner",
    });

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
