import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { call } from "@orpc/server";
import { InngestTestEngine } from "@inngest/test";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { eq } from "drizzle-orm";
import type * as schema from "@scheduling/db/schema";
import { workflowRunEntityLinks } from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import {
  clearTestOrgContext,
  closeTestDb,
  createOrg,
  createTestContext,
  createTestDb,
  resetTestDb,
  setTestOrgContext,
} from "../../test-utils/index.js";
import { workflowRoutes } from "../../routes/workflows.js";
import { createWorkflowDispatchFunction } from "./workflow-dispatch.js";
import { createWorkflowExecutionFunction } from "./workflow-execution.js";
import { listEnabledWorkflowDispatchTargets } from "../../services/workflows/runtime.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("workflow dispatch pipeline integration", () => {
  let db: Database;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  test("dispatching a bound event executes workflow and records run link", async () => {
    const { org, user } = await createOrg(db);
    const context = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "owner",
    });

    const created = await call(
      workflowRoutes.createDefinition,
      {
        key: "client_created_pipeline",
        name: "Client Created Pipeline",
        workflowGraph: {
          trigger: {
            type: "domain_event",
            domain: "client",
            startEvents: ["client.created"],
            restartEvents: [],
            stopEvents: [],
          },
        },
      },
      { context },
    );
    const published = await call(
      workflowRoutes.publishDraft,
      {
        id: created.id,
        expectedRevision: created.draftRevision,
      },
      { context },
    );
    expect(published.activeVersion?.id).toBeDefined();
    expect(
      published.bindings.map((binding) => binding.eventType).toSorted(),
    ).toEqual(["client.created"]);

    const executionEngine = new InngestTestEngine({
      function: createWorkflowExecutionFunction(),
    });
    const dispatchFunction = createWorkflowDispatchFunction(
      "client.created",
      listEnabledWorkflowDispatchTargets,
      async (event) => {
        await executionEngine.execute({
          events: [event],
        });
      },
    );
    const dispatchEngine = new InngestTestEngine({
      function: dispatchFunction,
    });

    const clientId = "0198d09f-ff07-7f46-a5d9-26a3f0d9f111";
    const { result } = await dispatchEngine.execute({
      events: [
        {
          id: "evt-pipeline-1",
          ts: 1_700_000_000_000,
          name: "client.created",
          data: {
            orgId: org.id,
            clientId,
            firstName: "Pipeline",
            lastName: "Test",
            email: null,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      sourceEventType: "client.created",
      orgId: org.id,
      scheduledWorkflowCount: 1,
    });

    await setTestOrgContext(db, org.id);
    try {
      const [runLink] = await db
        .select()
        .from(workflowRunEntityLinks)
        .where(eq(workflowRunEntityLinks.entityId, clientId))
        .limit(1);

      expect(runLink).toBeDefined();
      if (!runLink) {
        throw new Error("Expected workflow run link to be created");
      }

      expect(runLink.orgId).toBe(org.id);
      expect(runLink.definitionId).toBe(created.id);
      expect(runLink.versionId).toBe(published.activeVersion?.id ?? null);
      expect(runLink.workflowType).toBe(created.key);
      expect(runLink.entityType).toBe("client");
      expect(["running", "completed", "cancelled"]).toContain(
        runLink.runStatus,
      );
      expect(runLink.runRevision).toBeGreaterThanOrEqual(1);
      expect(typeof runLink.runId).toBe("string");
      expect(runLink.runId.length).toBeGreaterThan(0);
    } finally {
      await clearTestOrgContext(db);
    }
  });
});
