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
import { inngest } from "../inngest/client.js";
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
import { integrationRoutes } from "./integrations.js";
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
  const originalInngestSend = inngest.send.bind(inngest);

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = originalInngestSend;
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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
          workflowGraph: {
            trigger: {
              type: "domain_event",
              domain: "appointment",
              startEvents: ["appointment.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("catalog is readable by members and returns trigger/action definitions", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });

    const catalog = await call(workflowRoutes.catalog, undefined, { context });

    expect(catalog.triggers.length).toBeGreaterThan(0);
    expect(catalog.actions.length).toBeGreaterThan(0);
    expect(catalog.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "domain_event",
          domain: "appointment",
        }),
        expect.objectContaining({
          type: "schedule",
          label: "Schedule",
        }),
      ]),
    );
    expect(catalog.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "core.emitInternalEvent",
        }),
        expect.objectContaining({
          id: "logger.logMessage",
          requiresIntegration: {
            key: "logger",
            mode: "enabled_and_configured",
          },
        }),
      ]),
    );
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
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
    expect(fetched.draftWorkflowGraph).toEqual(created.draftWorkflowGraph);
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
      },
      { context },
    );

    await expect(
      call(
        workflowRoutes.createDefinition,
        {
          key: "appointment_reminders",
          name: "Duplicate",
          workflowGraph: {
            trigger: {
              type: "domain_event",
              domain: "appointment",
              startEvents: ["appointment.updated"],
              restartEvents: [],
              stopEvents: [],
            },
          },
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
      },
      { context },
    );

    const updated = await call(
      workflowRoutes.updateDraft,
      {
        id: created.id,
        expectedRevision: 1,
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.updated"],
            restartEvents: [],
            stopEvents: [],
          },
          steps: [{ id: "step_2", type: "notify" }],
        },
      },
      { context },
    );

    expect(updated.draftRevision).toBe(2);
    expect(updated.draftWorkflowGraph).toMatchObject({
      trigger: {
        type: "domain_event",
        domain: "appointment",
        startEvents: ["appointment.updated"],
        restartEvents: [],
        stopEvents: [],
      },
      steps: [{ id: "step_2", type: "notify" }],
    });

    await expect(
      call(
        workflowRoutes.updateDraft,
        {
          id: created.id,
          expectedRevision: 1,
          workflowGraph: {
            trigger: {
              type: "domain_event",
              domain: "appointment",
              startEvents: ["appointment.cancelled"],
              restartEvents: [],
              stopEvents: [],
            },
          },
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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

  test("validateDraft and publishDraft fail when required integration is disabled", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "integration_required_validation",
        name: "Integration Required Validation",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "client",
            startEvents: ["client.created"],
            restartEvents: [],
            stopEvents: [],
          },
          nodes: [
            {
              id: "log_action",
              kind: "action",
              actionId: "logger.logMessage",
              input: {
                message: "Client created",
                level: "info",
              },
            },
          ],
          edges: [],
        },
      },
      { context },
    );

    const validation = await call(
      workflowRoutes.validateDraft,
      { id: workflow.id },
      { context },
    );

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INTEGRATION_NOT_CONFIGURED",
          nodeId: "log_action",
          field: "actionId",
        }),
      ]),
    );

    await expect(
      call(
        workflowRoutes.publishDraft,
        {
          id: workflow.id,
          expectedRevision: 1,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    await call(
      integrationRoutes.update,
      {
        key: "logger",
        enabled: true,
      },
      { context },
    );

    const validationAfterEnable = await call(
      workflowRoutes.validateDraft,
      { id: workflow.id },
      { context },
    );
    expect(validationAfterEnable.valid).toBe(true);

    const published = await call(
      workflowRoutes.publishDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
      },
      { context },
    );
    expect(published.activeVersion).not.toBeNull();
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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
    expect(firstPublish.activeVersion?.workflowGraph).toMatchObject({
      trigger: {
        type: "domain_event",
        domain: "appointment",
        startEvents: ["appointment.created"],
        restartEvents: [],
        stopEvents: [],
      },
    });
    expect(firstPublish.activeVersion?.compiledPlan).toMatchObject({
      planVersion: 2,
      trigger: {
        type: "domain_event",
        domain: "appointment",
        startEvents: ["appointment.created"],
        restartEvents: [],
        stopEvents: [],
      },
    });
    expect(firstPublish.activeVersion?.createdBy).toBe(user.id);
    expect(firstPublish.activeVersion?.checksum).toHaveLength(64);

    const updated = await call(
      workflowRoutes.updateDraft,
      {
        id: created.id,
        expectedRevision: 1,
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.updated"],
            restartEvents: [],
            stopEvents: [],
          },
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
    expect(secondPublish.activeVersion?.workflowGraph).toMatchObject({
      trigger: {
        type: "domain_event",
        domain: "appointment",
        startEvents: ["appointment.updated"],
        restartEvents: [],
        stopEvents: [],
      },
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

    const invalidGraph = await call(
      workflowRoutes.createDefinition,
      {
        key: "invalid_edges",
        name: "Invalid Edges",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "client",
            startEvents: ["client.created"],
            restartEvents: [],
            stopEvents: [],
          },
          nodes: [
            {
              id: "node_1",
              kind: "action",
              actionId: "send-email",
            },
          ],
          edges: [{ id: "edge_1", source: "node_1", target: "missing_node" }],
        },
      },
      { context },
    );

    const invalidGraphValidation = await call(
      workflowRoutes.validateDraft,
      { id: invalidGraph.id },
      { context },
    );
    expect(invalidGraphValidation.valid).toBe(false);
    expect(invalidGraphValidation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INVALID_EDGE",
          edgeId: "edge_1",
        }),
      ]),
    );

    await expect(
      call(
        workflowRoutes.publishDraft,
        {
          id: invalidGraph.id,
          expectedRevision: 1,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    const invalidAction = await call(
      workflowRoutes.createDefinition,
      {
        key: "invalid_action",
        name: "Invalid Action",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "client",
            startEvents: ["client.created"],
            restartEvents: [],
            stopEvents: [],
          },
          nodes: [
            {
              id: "node_1",
              kind: "action",
              actionId: "unknown.action",
              input: {},
            },
          ],
          edges: [],
        },
      },
      { context },
    );

    const invalidActionValidation = await call(
      workflowRoutes.validateDraft,
      { id: invalidAction.id },
      { context },
    );
    expect(invalidActionValidation.valid).toBe(false);
    expect(invalidActionValidation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNKNOWN_ACTION",
          nodeId: "node_1",
          field: "actionId",
        }),
      ]),
    );

    await expect(
      call(
        workflowRoutes.publishDraft,
        {
          id: invalidAction.id,
          expectedRevision: 1,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  test("publishDraft derives event bindings from domain trigger config", async () => {
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: ["appointment.rescheduled"],
            stopEvents: ["appointment.cancelled"],
          },
        },
      },
      { context },
    );

    const published = await call(
      workflowRoutes.publishDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
      },
      { context },
    );

    expect(
      published.bindings.map((binding) => binding.eventType).toSorted(),
    ).toEqual([
      "appointment.cancelled",
      "appointment.created",
      "appointment.rescheduled",
    ]);
    expect(published.scheduleBindings).toEqual([]);
  });

  test("bindings list returns system-managed event and schedule projections", async () => {
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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

    const listed = await call(
      workflowRoutes.bindings.list,
      { id: workflow.id },
      { context },
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.eventType).toBe("appointment.created");
    expect(listed.schedules).toEqual([]);
  });

  test("publishDraft creates schedule bindings for schedule triggers", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "schedule_binding_publish",
        name: "Schedule Binding Publish",
        workflowGraph: {
          trigger: {
            type: "schedule",
            expression: "*/15 * * * *",
            timezone: "America/New_York",
          },
        },
      },
      { context },
    );

    const published = await call(
      workflowRoutes.publishDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
      },
      { context },
    );

    expect(published.bindings).toEqual([]);
    expect(published.scheduleBindings).toHaveLength(1);
    expect(published.scheduleBindings[0]?.scheduleExpression).toBe(
      "*/15 * * * *",
    );
    expect(published.scheduleBindings[0]?.scheduleTimezone).toBe(
      "America/New_York",
    );
    expect(published.scheduleBindings[0]?.nextRunAt).not.toBeNull();
  });

  test("publishDraft replaces binding projection when trigger events change", async () => {
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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
    expect(firstPublish.bindings.map((binding) => binding.eventType)).toEqual([
      "appointment.created",
    ]);

    await call(
      workflowRoutes.updateDraft,
      {
        id: workflow.id,
        expectedRevision: 1,
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.updated"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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

    expect(secondPublish.bindings.map((binding) => binding.eventType)).toEqual([
      "appointment.updated",
    ]);

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

  test("runDraft dispatches manual workflow trigger events with compiled draft plan", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const sendMock = mock(async () => ({ ids: ["evt_manual_1"] }));
    (
      inngest as unknown as {
        send: typeof inngest.send;
      }
    ).send = sendMock;

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "manual_run_draft",
        name: "Manual Run Draft",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "client",
            startEvents: ["client.created"],
            restartEvents: [],
            stopEvents: [],
          },
          nodes: [
            {
              id: "action_1",
              kind: "action",
              actionId: "core.emitInternalEvent",
              input: {
                eventType: "workflow.intent.manualRun",
                payload: {
                  note: "Manual run",
                },
              },
            },
          ],
          edges: [],
        },
      },
      { context },
    );

    const runResponse = await call(
      workflowRoutes.runDraft,
      {
        id: workflow.id,
        entityType: "client",
        entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90299",
      },
      { context },
    );

    expect(runResponse.success).toBe(true);
    expect(runResponse.triggerEventId).toContain("manual:");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: runResponse.triggerEventId,
        name: "scheduling/workflow.triggered",
        data: expect.objectContaining({
          orgId: org.id,
          workflow: expect.objectContaining({
            definitionId: workflow.id,
            workflowType: "manual_run_draft",
            versionId: null,
            compiledPlan: expect.objectContaining({
              planVersion: 2,
            }),
          }),
          sourceEvent: expect.objectContaining({
            id: runResponse.triggerEventId,
            type: "manual.triggered",
          }),
          entity: {
            type: "client",
            id: "0198d09f-ff07-7f46-a5d9-26a3f0d90299",
          },
        }),
      }),
    );
  });

  test("runDraft rejects invalid workflow drafts", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "invalid_manual_run_draft",
        name: "Invalid Manual Run Draft",
        workflowGraph: {
          nodes: [],
          edges: [],
        },
      },
      { context },
    );

    await expect(
      call(
        workflowRoutes.runDraft,
        {
          id: workflow.id,
          entityType: "client",
          entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90388",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  test("runDraft rejects when an action requires a disabled integration", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const workflow = await call(
      workflowRoutes.createDefinition,
      {
        key: "integration_required_run",
        name: "Integration Required Run",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "client",
            startEvents: ["client.created"],
            restartEvents: [],
            stopEvents: [],
          },
          nodes: [
            {
              id: "log_action",
              kind: "action",
              actionId: "logger.logMessage",
              input: {
                message: "Run me",
                level: "warning",
              },
            },
          ],
          edges: [],
        },
      },
      { context },
    );

    await expect(
      call(
        workflowRoutes.runDraft,
        {
          id: workflow.id,
          entityType: "client",
          entityId: "0198d09f-ff07-7f46-a5d9-26a3f0d90321",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
      },
      { context },
    );
    const workflowB = await call(
      workflowRoutes.createDefinition,
      {
        key: "workflow_b",
        name: "Workflow B",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.updated"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "appointment",
            startEvents: ["appointment.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
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
