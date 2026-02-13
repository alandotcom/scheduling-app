import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { and, eq } from "drizzle-orm";
import type * as schema from "@scheduling/db/schema";
import {
  workflowDefinitionVersions,
  workflowDefinitions,
  workflowDeliveryLog,
  workflowRunEntityLinks,
} from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import {
  clearTestOrgContext,
  closeTestDb,
  createOrg,
  createTestDb,
  resetTestDb,
  setTestOrgContext,
} from "../../test-utils/index.js";
import {
  buildWorkflowDeliveryKey,
  getWorkflowRunGuard,
  recordWorkflowDeliveryWithGuard,
} from "./runtime.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("workflow runtime delivery guards", () => {
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

  test("records delivery exactly once per deterministic delivery key", async () => {
    const { org } = await createOrg(db);
    await setTestOrgContext(db, org.id);

    try {
      const [definition] = await db
        .insert(workflowDefinitions)
        .values({
          orgId: org.id,
          key: "delivery_guard_test",
          name: "Delivery Guard Test",
          status: "active",
          draftWorkflowGraph: {
            trigger: { event: "client.created" },
          },
        })
        .returning();

      if (!definition) {
        throw new Error("Failed creating workflow definition fixture");
      }

      const [version] = await db
        .insert(workflowDefinitionVersions)
        .values({
          orgId: org.id,
          definitionId: definition.id,
          version: 1,
          workflowGraphSchemaVersion: 1,
          workflowGraph: {
            trigger: { event: "client.created" },
            workflow: { actions: [], edges: [] },
          },
          compiledPlan: {},
          checksum: "delivery-guard-test-v1",
        })
        .returning();

      if (!version) {
        throw new Error("Failed creating workflow version fixture");
      }

      const runId = "run-delivery-guard-1";
      await db.insert(workflowRunEntityLinks).values({
        orgId: org.id,
        definitionId: definition.id,
        versionId: version.id,
        runId,
        workflowType: definition.key,
        runRevision: 1,
        entityType: "client",
        entityId: Bun.randomUUIDv7(),
        runStatus: "running",
      });

      const deliveryKey = buildWorkflowDeliveryKey({
        runId,
        runRevision: 1,
        stepId: "workflow.execution.completed",
        channel: "workflow.runtime",
        target: "client:fixture",
      });

      const firstAttempt = await recordWorkflowDeliveryWithGuard({
        orgId: org.id,
        definitionId: definition.id,
        versionId: version.id,
        runId,
        expectedRunRevision: 1,
        workflowType: definition.key,
        stepId: "workflow.execution.completed",
        channel: "workflow.runtime",
        target: "client:fixture",
        deliveryKey,
      });

      const secondAttempt = await recordWorkflowDeliveryWithGuard({
        orgId: org.id,
        definitionId: definition.id,
        versionId: version.id,
        runId,
        expectedRunRevision: 1,
        workflowType: definition.key,
        stepId: "workflow.execution.completed",
        channel: "workflow.runtime",
        target: "client:fixture",
        deliveryKey,
      });

      expect(firstAttempt).toBe("recorded");
      expect(secondAttempt).toBe("duplicate");

      const rows = await db
        .select()
        .from(workflowDeliveryLog)
        .where(eq(workflowDeliveryLog.deliveryKey, deliveryKey));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.runRevision).toBe(1);
      expect(rows[0]?.status).toBe("sent");
    } finally {
      await clearTestOrgContext(db);
    }
  });

  test("blocks delivery when run revision no longer matches or run is cancelled", async () => {
    const { org } = await createOrg(db);
    await setTestOrgContext(db, org.id);

    try {
      const [definition] = await db
        .insert(workflowDefinitions)
        .values({
          orgId: org.id,
          key: "delivery_guard_block_test",
          name: "Delivery Guard Block Test",
          status: "active",
          draftWorkflowGraph: {
            trigger: { event: "appointment.created" },
          },
        })
        .returning();

      if (!definition) {
        throw new Error("Failed creating workflow definition fixture");
      }

      const [version] = await db
        .insert(workflowDefinitionVersions)
        .values({
          orgId: org.id,
          definitionId: definition.id,
          version: 1,
          workflowGraphSchemaVersion: 1,
          workflowGraph: {
            trigger: { event: "appointment.created" },
            workflow: { actions: [], edges: [] },
          },
          compiledPlan: {},
          checksum: "delivery-guard-block-v1",
        })
        .returning();

      if (!version) {
        throw new Error("Failed creating workflow version fixture");
      }

      const runId = "run-delivery-guard-2";
      await db.insert(workflowRunEntityLinks).values({
        orgId: org.id,
        definitionId: definition.id,
        versionId: version.id,
        runId,
        workflowType: definition.key,
        runRevision: 2,
        entityType: "appointment",
        entityId: Bun.randomUUIDv7(),
        runStatus: "cancelled",
      });

      const guard = await getWorkflowRunGuard({
        orgId: org.id,
        runId,
      });

      expect(guard).toEqual({
        runRevision: 2,
        runStatus: "cancelled",
      });

      const blockedByStatus = await recordWorkflowDeliveryWithGuard({
        orgId: org.id,
        definitionId: definition.id,
        versionId: version.id,
        runId,
        expectedRunRevision: 2,
        workflowType: definition.key,
        stepId: "workflow.execution.completed",
        channel: "workflow.runtime",
        deliveryKey: "workflow_delivery:status_block",
      });
      const blockedByRevision = await recordWorkflowDeliveryWithGuard({
        orgId: org.id,
        definitionId: definition.id,
        versionId: version.id,
        runId,
        expectedRunRevision: 1,
        workflowType: definition.key,
        stepId: "workflow.execution.completed",
        channel: "workflow.runtime",
        deliveryKey: "workflow_delivery:revision_block",
      });

      expect(blockedByStatus).toBe("guard_blocked");
      expect(blockedByRevision).toBe("guard_blocked");

      const rows = await db
        .select()
        .from(workflowDeliveryLog)
        .where(
          and(
            eq(workflowDeliveryLog.orgId, org.id),
            eq(workflowDeliveryLog.runId, runId),
          ),
        );
      expect(rows).toHaveLength(0);
    } finally {
      await clearTestOrgContext(db);
    }
  });
});
