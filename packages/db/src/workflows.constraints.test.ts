import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { sql } from "drizzle-orm";
import {
  clearTestOrgContext,
  closeTestDb,
  createTestDb,
  resetTestDb,
  seedSecondTestOrg,
  seedTestOrg,
  setTestOrgContext,
} from "./test-utils.js";
import { workflowExecutions, workflows } from "./schema/index.js";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "./schema/index.js";
import type { relations } from "./relations.js";

let db: BunSQLDatabase<typeof schema, typeof relations>;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

function expectUniqueViolation(error: unknown) {
  const codeCandidates = [
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined,
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
      ? error.cause.code
      : undefined,
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "cause" in error.cause &&
    typeof error.cause.cause === "object" &&
    error.cause.cause !== null &&
    "code" in error.cause.cause &&
    typeof error.cause.cause.code === "string"
      ? error.cause.cause.code
      : undefined,
  ].filter((value): value is string => value !== undefined);

  const message =
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "message" in error.cause &&
    typeof error.cause.message === "string"
      ? error.cause.message
      : error instanceof Error
        ? error.message
        : "unknown database error";

  expect(codeCandidates).toContain("ERR_POSTGRES_SERVER_ERROR");
  expect(message).toContain("duplicate key value");
}

describe("workflow constraints", () => {
  test("enforces case-insensitive workflow name uniqueness per org", async () => {
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, orgA.id);
    await db.insert(workflows).values({
      orgId: orgA.id,
      name: "Client Follow Up",
      graph: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      visibility: "private",
    });

    try {
      await db.insert(workflows).values({
        orgId: orgA.id,
        name: "client follow up",
        graph: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        visibility: "private",
      });
      throw new Error("expected unique violation");
    } catch (error) {
      expectUniqueViolation(error);
    }

    await setTestOrgContext(db, orgB.id);
    const createdInOrgB = await db
      .insert(workflows)
      .values({
        orgId: orgB.id,
        name: "client follow up",
        graph: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        visibility: "private",
      })
      .returning();

    expect(createdInOrgB).toHaveLength(1);
    await clearTestOrgContext(db);
  });

  test("enforces workflow run id uniqueness within an org", async () => {
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, orgA.id);
    const [workflowA] = await db
      .insert(workflows)
      .values({
        orgId: orgA.id,
        name: "Exec A",
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        visibility: "private",
      })
      .returning();

    await db.insert(workflowExecutions).values({
      orgId: orgA.id,
      workflowId: workflowA!.id,
      workflowRunId: "run-123",
      status: "pending",
      isDryRun: false,
    });

    try {
      await db.insert(workflowExecutions).values({
        orgId: orgA.id,
        workflowId: workflowA!.id,
        workflowRunId: "run-123",
        status: "pending",
        isDryRun: false,
      });
      throw new Error("expected unique violation");
    } catch (error) {
      expectUniqueViolation(error);
    }

    await setTestOrgContext(db, orgB.id);
    const [workflowB] = await db
      .insert(workflows)
      .values({
        orgId: orgB.id,
        name: "Exec B",
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        visibility: "private",
      })
      .returning();

    const createdInOrgB = await db
      .insert(workflowExecutions)
      .values({
        orgId: orgB.id,
        workflowId: workflowB!.id,
        workflowRunId: "run-123",
        status: "pending",
        isDryRun: false,
      })
      .returning();

    expect(createdInOrgB).toHaveLength(1);
    await clearTestOrgContext(db);
  });

  test("creates key workflow indexes", async () => {
    const result = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'workflows_org_name_ci_uidx',
          'workflow_executions_org_workflow_run_id_uidx',
          'workflow_executions_org_workflow_started_at_idx',
          'workflow_executions_org_workflow_correlation_key_idx',
          'workflow_execution_logs_org_execution_id_idx',
          'workflow_execution_logs_org_execution_timestamp_idx',
          'workflow_execution_events_org_workflow_created_at_idx',
          'workflow_execution_events_org_execution_created_at_idx',
          'workflow_wait_states_hook_token_uidx',
          'workflow_wait_states_org_execution_status_idx',
          'workflow_wait_states_org_workflow_correlation_status_idx',
          'workflow_wait_states_org_run_id_idx'
        )
      ORDER BY indexname
    `);

    expect(result.map((row) => row["indexname"])).toEqual([
      "workflow_execution_events_org_execution_created_at_idx",
      "workflow_execution_events_org_workflow_created_at_idx",
      "workflow_execution_logs_org_execution_id_idx",
      "workflow_execution_logs_org_execution_timestamp_idx",
      "workflow_executions_org_workflow_correlation_key_idx",
      "workflow_executions_org_workflow_run_id_uidx",
      "workflow_executions_org_workflow_started_at_idx",
      "workflow_wait_states_hook_token_uidx",
      "workflow_wait_states_org_execution_status_idx",
      "workflow_wait_states_org_run_id_idx",
      "workflow_wait_states_org_workflow_correlation_status_idx",
      "workflows_org_name_ci_uidx",
    ]);
  });
});
