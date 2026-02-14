import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { call } from "@orpc/server";
import type { SerializedWorkflowGraph } from "@scheduling/dto";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import {
  closeTestDb,
  createOrg,
  createOrgMember,
  createTestContext,
  createTestDb,
  resetTestDb,
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

describe("Workflow Routes", () => {
  let db: Database;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
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

    const fetched = await call(
      workflowRoutes.get,
      { id: created.id },
      { context: memberContext },
    );
    expect(fetched.id).toBe(created.id);
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
});
