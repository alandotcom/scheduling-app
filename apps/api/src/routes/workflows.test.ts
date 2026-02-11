import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { call } from "@orpc/server";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { and, eq } from "drizzle-orm";
import type * as schema from "@scheduling/db/schema";
import {
  workflowBindings,
  workflowDefinitionVersions,
  workflowRunEntityLinks,
} from "@scheduling/db/schema";
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

async function createWorkflowRunLink(input: {
  db: Database;
  orgId: string;
  runId: string;
  workflowType: string;
  entityType: string;
  entityId: string;
  definitionId?: string | null;
  versionId?: string | null;
  runStatus?: string;
  runRevision?: number;
  startedAt?: Date;
  lastSeenAt?: Date;
}) {
  await setTestOrgContext(input.db, input.orgId);
  try {
    const [created] = await input.db
      .insert(workflowRunEntityLinks)
      .values({
        orgId: input.orgId,
        definitionId: input.definitionId ?? null,
        versionId: input.versionId ?? null,
        runId: input.runId,
        workflowType: input.workflowType,
        runRevision: input.runRevision ?? 1,
        entityType: input.entityType,
        entityId: input.entityId,
        runStatus: input.runStatus ?? "unknown",
        startedAt: input.startedAt ?? new Date(),
        lastSeenAt: input.lastSeenAt ?? new Date(),
      })
      .returning();

    return created!;
  } finally {
    await clearTestOrgContext(input.db);
  }
}

describe("Workflow Routes", () => {
  let db: Database;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

  test("listDefinitions allows member roles", async () => {
    const { org, user } = await createOrg(db);
    const ownerContext = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await call(
      workflowRoutes.createDefinition,
      {
        key: "member_visible_workflow",
        name: "Member Visible Workflow",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context: ownerContext },
    );

    const memberContext = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });

    const listed = await call(
      workflowRoutes.listDefinitions,
      {},
      {
        context: memberContext,
      },
    );

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.key).toBe("member_visible_workflow");
  });

  test("createDefinition rejects non-admin roles", async () => {
    const context = createContext({ role: "member" });

    await expect(
      call(
        workflowRoutes.createDefinition,
        {
          key: "member_cannot_create",
          name: "Member Cannot Create",
          workflowKit: { trigger: { event: "appointment.created" } },
        },
        { context },
      ),
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
    expect(updated.draftWorkflowKit).toMatchObject({
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
    expect(firstPublish.activeVersion?.workflowKit).toMatchObject({
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
    expect(secondPublish.activeVersion?.workflowKit).toMatchObject({
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

  test("upsertBinding requires an active published version", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "binding_requires_publish",
        name: "Binding Requires Publish",
      },
      { context },
    );

    await expect(
      call(
        workflowRoutes.bindings.upsert,
        {
          id: workflow.id,
          eventType: "appointment.created",
          enabled: true,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  test("binding lifecycle supports upsert, list, and remove", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "binding_lifecycle",
        name: "Binding Lifecycle",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );
    await call(
      workflowRoutes.publishDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
      },
      { context },
    );

    const created = await call(
      workflowRoutes.bindings.upsert,
      {
        id: workflow.id,
        eventType: "appointment.created",
        enabled: true,
      },
      { context },
    );
    expect(created.definitionId).toBe(workflow.id);
    expect(created.eventType).toBe("appointment.created");
    expect(created.enabled).toBe(true);

    const updated = await call(
      workflowRoutes.bindings.upsert,
      {
        id: workflow.id,
        eventType: "appointment.created",
        enabled: false,
      },
      { context },
    );
    expect(updated.id).toBe(created.id);
    expect(updated.enabled).toBe(false);

    const listed = await call(
      workflowRoutes.bindings.list,
      { id: workflow.id },
      { context },
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.id).toBe(created.id);
    expect(listed.items[0]?.enabled).toBe(false);

    const removed = await call(
      workflowRoutes.bindings.remove,
      {
        id: workflow.id,
        eventType: "appointment.created",
      },
      { context },
    );
    expect(removed.success).toBe(true);

    const listedAfterRemove = await call(
      workflowRoutes.bindings.list,
      { id: workflow.id },
      { context },
    );
    expect(listedAfterRemove.items).toEqual([]);

    await expect(
      call(
        workflowRoutes.bindings.remove,
        {
          id: workflow.id,
          eventType: "appointment.created",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("publishDraft repoints existing bindings to newly published version", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "binding_repoint",
        name: "Binding Repoint",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );

    const firstPublish = await call(
      workflowRoutes.publishDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
      },
      { context },
    );
    const firstVersionId = firstPublish.activeVersion?.id;
    expect(firstVersionId).toBeDefined();

    await call(
      workflowRoutes.bindings.upsert,
      {
        id: workflow.id,
        eventType: "appointment.updated",
        enabled: true,
      },
      { context },
    );

    await call(
      workflowRoutes.updateDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
        workflowKit: { trigger: { event: "appointment.updated" } },
      },
      { context },
    );
    const secondPublish = await call(
      workflowRoutes.publishDraft,
      {
        id: workflow.id,
        expectedRevision: 2,
      },
      { context },
    );

    expect(secondPublish.activeVersion?.id).toBeDefined();
    expect(secondPublish.activeVersion?.id).not.toBe(firstVersionId);

    await setTestOrgContext(db, org.id);
    try {
      const [binding] = await db
        .select()
        .from(workflowBindings)
        .where(
          and(
            eq(workflowBindings.definitionId, workflow.id),
            eq(workflowBindings.eventType, "appointment.updated"),
          ),
        )
        .limit(1);

      expect(binding).toBeDefined();
      expect(binding?.versionId).toBe(secondPublish.activeVersion?.id);
    } finally {
      await clearTestOrgContext(db);
    }
  });

  test("listRuns returns sorted and filtered runs", async () => {
    const { org, user } = await createOrg(db);
    const { org: otherOrg } = await createOrg(db);

    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });

    const workflowA = await call(
      workflowRoutes.createDefinition,
      {
        key: "workflow_a",
        name: "Workflow A",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );
    const workflowB = await call(
      workflowRoutes.createDefinition,
      {
        key: "workflow_b",
        name: "Workflow B",
        workflowKit: { trigger: { event: "appointment.updated" } },
      },
      { context },
    );

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-older",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90111",
      definitionId: workflowA.id,
      runStatus: "running",
      startedAt: new Date("2026-02-10T10:00:00.000Z"),
      lastSeenAt: new Date("2026-02-10T11:00:00.000Z"),
    });

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-newer",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90112",
      definitionId: workflowA.id,
      runStatus: "failed",
      startedAt: new Date("2026-02-11T10:00:00.000Z"),
      lastSeenAt: new Date("2026-02-11T11:00:00.000Z"),
    });

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-other-workflow",
      workflowType: "appointment.followup",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90113",
      definitionId: workflowB.id,
      runStatus: "completed",
      startedAt: new Date("2026-02-09T10:00:00.000Z"),
      lastSeenAt: new Date("2026-02-09T11:00:00.000Z"),
    });

    await createWorkflowRunLink({
      db,
      orgId: otherOrg.id,
      runId: "run-other-org",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90114",
      runStatus: "running",
    });

    const listed = await call(
      workflowRoutes.listRuns,
      {
        workflowType: "appointment.reminder",
        limit: 50,
      },
      { context },
    );

    expect(listed.items).toHaveLength(2);
    expect(listed.items.map((item) => item.runId)).toEqual([
      "run-newer",
      "run-older",
    ]);

    const filteredByDefinition = await call(
      workflowRoutes.listRuns,
      {
        definitionId: workflowB.id,
        limit: 50,
      },
      { context },
    );
    expect(filteredByDefinition.items).toHaveLength(1);
    expect(filteredByDefinition.items[0]?.runId).toBe("run-other-workflow");

    const filteredByStatus = await call(
      workflowRoutes.listRuns,
      {
        status: "failed",
        limit: 50,
      },
      { context },
    );
    expect(filteredByStatus.items).toHaveLength(1);
    expect(filteredByStatus.items[0]?.runId).toBe("run-newer");

    const listedAsMember = await call(
      workflowRoutes.listRuns,
      {
        workflowType: "appointment.reminder",
        limit: 50,
      },
      { context: memberContext },
    );
    expect(listedAsMember.items.map((item) => item.runId)).toEqual([
      "run-newer",
      "run-older",
    ]);
  });

  test("getRun returns run details and enforces org isolation", async () => {
    const { org, user } = await createOrg(db);
    const { org: otherOrg, user: otherUser } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });
    const otherContext = createTestContext({
      orgId: otherOrg.id,
      userId: otherUser.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "run_detail_workflow",
        name: "Run Detail Workflow",
        workflowKit: { trigger: { event: "appointment.created" } },
      },
      { context },
    );

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-detail-1",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90121",
      definitionId: workflow.id,
      versionId: null,
      runStatus: "running",
    });

    const run = await call(
      workflowRoutes.getRun,
      { runId: "run-detail-1" },
      { context },
    );

    expect(run.runId).toBe("run-detail-1");
    expect(run.workflowType).toBe("appointment.reminder");
    expect(run.status).toBe("running");
    expect(run.definitionVersionId).toBeNull();

    const memberRun = await call(
      workflowRoutes.getRun,
      { runId: "run-detail-1" },
      { context: memberContext },
    );
    expect(memberRun.runId).toBe("run-detail-1");

    await expect(
      call(
        workflowRoutes.getRun,
        { runId: "run-detail-1" },
        { context: otherContext },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("cancelRun rejects non-admin roles", async () => {
    const { org, user } = await createOrg(db);
    const ownerContext = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });
    const memberContext = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-member-cannot-cancel",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90125",
      runStatus: "running",
    });

    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify({ id: "cancellation-member" }), {
          status: 200,
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      call(
        workflowRoutes.cancelRun,
        { runId: "run-member-cannot-cancel" },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await call(
      workflowRoutes.cancelRun,
      { runId: "run-member-cannot-cancel" },
      { context: ownerContext },
    );
  });

  test("cancelRun marks run as cancelled and increments runRevision", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-cancel-1",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90131",
      runStatus: "running",
      runRevision: 3,
      startedAt: new Date("2026-02-11T08:00:00.000Z"),
      lastSeenAt: new Date("2026-02-11T08:05:00.000Z"),
    });

    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify({ id: "cancellation-1" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const cancelled = await call(
      workflowRoutes.cancelRun,
      { runId: "run-cancel-1" },
      { context },
    );

    expect(cancelled.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchCalls = fetchMock.mock.calls as unknown[][];
    expect(fetchCalls[0]).toBeDefined();
    expect(String(fetchCalls[0]?.[0])).toContain(
      "/v1/runs/run-cancel-1/cancel",
    );

    await setTestOrgContext(db, org.id);
    try {
      const [row] = await db
        .select()
        .from(workflowRunEntityLinks)
        .where(eq(workflowRunEntityLinks.runId, "run-cancel-1"))
        .limit(1);

      expect(row).toBeDefined();
      expect(row?.runStatus).toBe("cancelled");
      expect(row?.cancelledAt).not.toBeNull();
      expect(row?.runRevision).toBe(4);
    } finally {
      await clearTestOrgContext(db);
    }
  });

  test("cancelRun status transition is reflected by listRuns and getRun", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-cancel-transition-1",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90132",
      runStatus: "running",
      runRevision: 1,
      startedAt: new Date("2026-02-11T09:00:00.000Z"),
      lastSeenAt: new Date("2026-02-11T09:05:00.000Z"),
    });

    const fetchMock = mock(
      async () =>
        new Response(JSON.stringify({ id: "cancellation-2" }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const cancelled = await call(
      workflowRoutes.cancelRun,
      { runId: "run-cancel-transition-1" },
      { context },
    );
    expect(cancelled.success).toBe(true);

    const listed = await call(
      workflowRoutes.listRuns,
      {
        status: "cancelled",
        limit: 50,
      },
      { context },
    );
    expect(
      listed.items.some((item) => item.runId === "run-cancel-transition-1"),
    ).toBe(true);

    const run = await call(
      workflowRoutes.getRun,
      { runId: "run-cancel-transition-1" },
      { context },
    );
    expect(run.status).toBe("cancelled");
    expect(run.runRevision).toBe(2);
  });

  test("cancelRun returns NOT_FOUND when run is missing", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await expect(
      call(
        workflowRoutes.cancelRun,
        {
          runId: "missing-run",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("cancelRun bubbles Inngest cancellation failures and does not mutate run status", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    await createWorkflowRunLink({
      db,
      orgId: org.id,
      runId: "run-cancel-fail",
      workflowType: "appointment.reminder",
      entityType: "appointment",
      entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90151",
      runStatus: "running",
      runRevision: 2,
      startedAt: new Date("2026-02-11T08:00:00.000Z"),
      lastSeenAt: new Date("2026-02-11T08:05:00.000Z"),
    });

    const fetchMock = mock(async () => new Response("boom", { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      call(
        workflowRoutes.cancelRun,
        {
          runId: "run-cancel-fail",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await setTestOrgContext(db, org.id);
    try {
      const [row] = await db
        .select()
        .from(workflowRunEntityLinks)
        .where(eq(workflowRunEntityLinks.runId, "run-cancel-fail"))
        .limit(1);

      expect(row).toBeDefined();
      expect(row?.runStatus).toBe("running");
      expect(row?.cancelledAt).toBeNull();
      expect(row?.runRevision).toBe(2);
    } finally {
      await clearTestOrgContext(db);
    }
  });
});
