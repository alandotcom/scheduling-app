import { describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import {
  clearTestOrgContext,
  getTestDb,
  type TestDatabase,
  seedSecondTestOrg,
  seedTestOrg,
  setTestOrgContext,
} from "./test-utils.js";
import {
  journeyDeliveries,
  journeyRuns,
  journeyVersions,
  journeys,
} from "./schema/index.js";

const db: TestDatabase = getTestDb();

function resultRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function expectUniqueViolation(error: unknown) {
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

  expect(message).toContain("duplicate key value");
}

describe("journey constraints", () => {
  test("enforces case-insensitive journey name uniqueness per org", async () => {
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, orgA.id);
    await db.insert(journeys).values({
      orgId: orgA.id,
      name: "Post-Visit Follow Up",
      state: "draft",
      draftDefinition: { steps: [] },
    });

    try {
      await db.insert(journeys).values({
        orgId: orgA.id,
        name: "post-visit follow up",
        state: "draft",
        draftDefinition: { steps: [] },
      });
      throw new Error("expected unique violation");
    } catch (error) {
      expectUniqueViolation(error);
    }

    await setTestOrgContext(db, orgB.id);
    const createdInOrgB = await db
      .insert(journeys)
      .values({
        orgId: orgB.id,
        name: "post-visit follow up",
        state: "draft",
        draftDefinition: { steps: [] },
      })
      .returning();

    expect(createdInOrgB).toHaveLength(1);
    await clearTestOrgContext(db);
  });

  test("enforces deterministic run identity uniqueness", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);

    const [journey] = await db
      .insert(journeys)
      .values({
        orgId: org.id,
        name: "Run Identity",
        state: "published",
        draftDefinition: { steps: [] },
      })
      .returning();

    const [journeyVersion] = await db
      .insert(journeyVersions)
      .values({
        orgId: org.id,
        journeyId: journey!.id,
        version: 1,
        definitionSnapshot: { steps: [] },
      })
      .returning();

    const appointmentId = "5a2b0128-c1a2-4abc-9152-80b36d88f111";
    await db.insert(journeyRuns).values({
      orgId: org.id,
      journeyVersionId: journeyVersion!.id,
      appointmentId,
      mode: "live",
      status: "planned",
      journeyNameSnapshot: journey!.name,
      journeyVersionSnapshot: { version: 1 },
    });

    try {
      await db.insert(journeyRuns).values({
        orgId: org.id,
        journeyVersionId: journeyVersion!.id,
        appointmentId,
        mode: "live",
        status: "planned",
        journeyNameSnapshot: journey!.name,
        journeyVersionSnapshot: { version: 1 },
      });
      throw new Error("expected unique violation");
    } catch (error) {
      expectUniqueViolation(error);
    }

    const createdDifferentMode = await db
      .insert(journeyRuns)
      .values({
        orgId: org.id,
        journeyVersionId: journeyVersion!.id,
        appointmentId,
        mode: "test",
        status: "planned",
        journeyNameSnapshot: journey!.name,
        journeyVersionSnapshot: { version: 1 },
      })
      .returning();

    expect(createdDifferentMode).toHaveLength(1);
    await clearTestOrgContext(db);
  });

  test("keeps run history queryable after journey and version hard-delete", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);

    const [journey] = await db
      .insert(journeys)
      .values({
        orgId: org.id,
        name: "Delete Retention",
        state: "published",
        draftDefinition: { steps: [{ type: "trigger" }] },
      })
      .returning();

    const [journeyVersion] = await db
      .insert(journeyVersions)
      .values({
        orgId: org.id,
        journeyId: journey!.id,
        version: 1,
        definitionSnapshot: { steps: [{ type: "trigger" }] },
      })
      .returning();

    const [run] = await db
      .insert(journeyRuns)
      .values({
        orgId: org.id,
        journeyVersionId: journeyVersion!.id,
        appointmentId: "7b020128-c1a2-4abc-9152-80b36d88f111",
        mode: "live",
        status: "completed",
        journeyNameSnapshot: journey!.name,
        journeyVersionSnapshot: { version: 1, state: "published" },
      })
      .returning();

    const [delivery] = await db
      .insert(journeyDeliveries)
      .values({
        orgId: org.id,
        journeyRunId: run!.id,
        stepKey: "send-email-1",
        channel: "email",
        scheduledFor: new Date("2026-02-16T12:00:00.000Z"),
        status: "sent",
        deterministicKey: "run:1:step:send-email-1:2026-02-16T12:00:00.000Z",
      })
      .returning();

    await db
      .delete(journeyVersions)
      .where(eq(journeyVersions.id, journeyVersion!.id));
    await db.delete(journeys).where(eq(journeys.id, journey!.id));

    const retainedRun = await db
      .select({
        runId: journeyRuns.id,
        versionId: journeyRuns.journeyVersionId,
        snapshot: journeyRuns.journeyVersionSnapshot,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, run!.id));

    expect(retainedRun).toHaveLength(1);
    expect(retainedRun[0]!.versionId).toBeNull();
    expect(retainedRun[0]!.snapshot).toEqual({
      version: 1,
      state: "published",
    });

    const retainedDelivery = await db
      .select({ id: journeyDeliveries.id })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.id, delivery!.id),
          eq(journeyDeliveries.journeyRunId, run!.id),
        ),
      );

    expect(retainedDelivery).toHaveLength(1);
    await clearTestOrgContext(db);
  });

  test("creates key journey indexes", async () => {
    const result = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'journeys_org_name_ci_uidx',
          'journey_versions_org_journey_version_uidx',
          'journey_runs_org_identity_uidx',
          'journey_runs_org_status_idx',
          'journey_runs_org_mode_started_at_idx',
          'journey_deliveries_org_deterministic_key_uidx',
          'journey_deliveries_org_run_scheduled_for_idx',
          'journey_deliveries_org_status_idx'
        )
      ORDER BY indexname
    `);

    const indexRows = resultRows<{ indexname: string }>(result);
    expect(indexRows.map((row) => row.indexname)).toEqual([
      "journey_deliveries_org_deterministic_key_uidx",
      "journey_deliveries_org_run_scheduled_for_idx",
      "journey_deliveries_org_status_idx",
      "journey_runs_org_identity_uidx",
      "journey_runs_org_mode_started_at_idx",
      "journey_runs_org_status_idx",
      "journey_versions_org_journey_version_uidx",
      "journeys_org_name_ci_uidx",
    ]);
  });
});
