import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { call } from "@orpc/server";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { eq } from "drizzle-orm";
import type * as schema from "@scheduling/db/schema";
import { workflowDefinitionVersions } from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import type { Context } from "../lib/orpc.js";
import {
  clearTestOrgContext,
  createOrg,
  createTestContext,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import { workflowRoutes } from "./workflows.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90001",
    orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
    sessionId: "test-session",
    tokenId: null,
    authMethod: "session",
    role: "owner",
    headers: new Headers(),
    ...overrides,
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

  test("listDefinitions rejects unauthenticated requests", async () => {
    const context = createContext({ userId: null, role: null, orgId: null });

    await expect(
      call(workflowRoutes.listDefinitions, {}, { context }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("listDefinitions rejects non-admin roles", async () => {
    const context = createContext({ role: "member" });

    await expect(
      call(workflowRoutes.listDefinitions, {}, { context }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("createDefinition + listDefinitions + getDefinition roundtrip", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.createDefinition,
      {
        key: "appointment_reminders",
        name: "Appointment Reminders",
        description: "Sends reminders before upcoming appointments",
        workflowKit: {
          trigger: { event: "appointment.created" },
          steps: [{ id: "step_1", type: "wait" }],
        },
      },
      { context },
    );

    expect(created.key).toBe("appointment_reminders");
    expect(created.name).toBe("Appointment Reminders");
    expect(created.status).toBe("draft");
    expect(created.draftRevision).toBe(1);
    expect(created.description).toBe(
      "Sends reminders before upcoming appointments",
    );
    expect(created.activeVersion).toBeNull();
    expect(created.bindings).toEqual([]);

    const listed = await call(workflowRoutes.listDefinitions, {}, { context });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.id).toBe(created.id);

    const fetched = await call(
      workflowRoutes.getDefinition,
      { id: created.id },
      { context },
    );
    expect(fetched.id).toBe(created.id);
    expect(fetched.draftWorkflowKit).toEqual(created.draftWorkflowKit);
  });

  test("createDefinition rejects duplicate workflow keys within an org", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await call(
      workflowRoutes.createDefinition,
      {
        key: "appointment_reminders",
        name: "First",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );

    await expect(
      call(
        workflowRoutes.createDefinition,
        {
          key: "appointment_reminders",
          name: "Duplicate",
          workflowKit: { trigger: { event: "appointment.updated" } },
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("updateDraft increments revision and enforces expectedRevision", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.createDefinition,
      {
        key: "followups",
        name: "Follow Ups",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );

    const updated = await call(
      workflowRoutes.updateDraft,
      {
        id: created.id,
        expectedRevision: 1,
        workflowKit: {
          trigger: { event: "appointment.updated" },
          steps: [{ id: "step_2", type: "notify" }],
        },
      },
      { context },
    );

    expect(updated.draftRevision).toBe(2);
    expect(updated.draftWorkflowKit).toEqual({
      trigger: { event: "appointment.updated" },
      steps: [{ id: "step_2", type: "notify" }],
    });

    await expect(
      call(
        workflowRoutes.updateDraft,
        {
          id: created.id,
          expectedRevision: 1,
          workflowKit: { trigger: { event: "appointment.cancelled" } },
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("validateDraft returns invalid for an empty draft and valid after update", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.createDefinition,
      {
        key: "empty_draft",
        name: "Empty Draft",
      },
      { context },
    );

    const invalidResult = await call(
      workflowRoutes.validateDraft,
      { id: created.id },
      { context },
    );
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.issues[0]?.code).toBe("MISSING_REQUIRED_FIELD");

    await call(
      workflowRoutes.updateDraft,
      {
        id: created.id,
        expectedRevision: 1,
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );

    const validResult = await call(
      workflowRoutes.validateDraft,
      { id: created.id },
      { context },
    );
    expect(validResult.valid).toBe(true);
    expect(validResult.issues).toEqual([]);
  });

  test("publishDraft creates immutable versions and updates active version", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.createDefinition,
      {
        key: "publish_flow",
        name: "Publish Flow",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );

    const firstPublish = await call(
      workflowRoutes.publishDraft,
      {
        id: created.id,
        expectedRevision: 1,
      },
      { context },
    );

    expect(firstPublish.status).toBe("active");
    expect(firstPublish.activeVersion).not.toBeNull();
    expect(firstPublish.activeVersion?.version).toBe(1);
    expect(firstPublish.activeVersion?.workflowKit).toEqual({
      trigger: { event: "appointment.created" },
    });
    expect(firstPublish.activeVersion?.createdBy).toBe(user.id);
    expect(firstPublish.activeVersion?.checksum).toHaveLength(64);

    const updated = await call(
      workflowRoutes.updateDraft,
      {
        id: created.id,
        expectedRevision: 1,
        workflowKit: {
          trigger: { event: "appointment.updated" },
          steps: [{ id: "step_1", type: "notify" }],
        },
      },
      { context },
    );
    expect(updated.draftRevision).toBe(2);

    const secondPublish = await call(
      workflowRoutes.publishDraft,
      {
        id: created.id,
        expectedRevision: 2,
      },
      { context },
    );

    expect(secondPublish.activeVersion?.version).toBe(2);
    expect(secondPublish.activeVersion?.workflowKit).toEqual({
      trigger: { event: "appointment.updated" },
      steps: [{ id: "step_1", type: "notify" }],
    });

    await setTestOrgContext(db, org.id);
    try {
      const versions = await db
        .select()
        .from(workflowDefinitionVersions)
        .where(eq(workflowDefinitionVersions.definitionId, created.id))
        .orderBy(workflowDefinitionVersions.version);

      expect(versions).toHaveLength(2);
      expect(versions.map((version) => version.version)).toEqual([1, 2]);
    } finally {
      await clearTestOrgContext(db);
    }
  });

  test("publishDraft rejects invalid drafts", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.createDefinition,
      {
        key: "invalid_publish",
        name: "Invalid Publish",
      },
      { context },
    );

    await expect(
      call(
        workflowRoutes.publishDraft,
        {
          id: created.id,
          expectedRevision: 1,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });
});
