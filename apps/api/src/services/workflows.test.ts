import { beforeEach, describe, expect, test } from "bun:test";
import { getTestDb, type TestDatabase } from "../test-utils/index.js";
import { createOrg } from "../test-utils/factories.js";
import { workflowService } from "./workflows.js";
import type { ServiceContext } from "./locations.js";
import type { SerializedWorkflowGraph } from "@scheduling/dto";

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

describe("WorkflowService", () => {
  const db: TestDatabase = getTestDb();
  let context: ServiceContext;
  let otherContext: ServiceContext;

  beforeEach(async () => {
    const primary = await createOrg(db as any, { name: "Primary Org" });
    context = { orgId: primary.org.id, userId: primary.user.id };

    const secondary = await createOrg(db as any, { name: "Secondary Org" });
    otherContext = { orgId: secondary.org.id, userId: secondary.user.id };
  });

  describe("validation and conflict handling", () => {
    test("rejects invalid graph payload on create", async () => {
      await expect(
        workflowService.create(
          {
            name: "Invalid Graph Workflow",
            graph: { nodes: "invalid", edges: [] } as any,
          },
          context,
        ),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    test("rejects empty update payload", async () => {
      const workflow = await workflowService.create(
        {
          name: "Needs Update",
          graph: createTestGraph("trigger-update"),
        },
        context,
      );

      await expect(
        workflowService.update(workflow.id, {} as any, context),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    test("throws CONFLICT for duplicate workflow name within the same org", async () => {
      await workflowService.create(
        {
          name: "Daily Digest",
          graph: createTestGraph("trigger-a"),
        },
        context,
      );

      await expect(
        workflowService.create(
          {
            name: "daily digest",
            graph: createTestGraph("trigger-b"),
          },
          context,
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("CRUD and org isolation", () => {
    test("creates, reads, lists, updates, and deletes workflows for one org", async () => {
      const created = await workflowService.create(
        {
          name: "Patient Follow-up",
          description: "Initial workflow",
          graph: createTestGraph("trigger-create"),
        },
        context,
      );

      expect(created.name).toBe("Patient Follow-up");
      expect(created.description).toBe("Initial workflow");
      expect(created.isEnabled).toBeFalse();
      expect(created.visibility).toBe("private");

      const fetched = await workflowService.get(created.id, context);
      expect(fetched.id).toBe(created.id);

      const listed = await workflowService.list(context);
      expect(listed.map((workflow) => workflow.id)).toContain(created.id);

      const updated = await workflowService.update(
        created.id,
        {
          name: "Patient Follow-up Updated",
          description: null,
          isEnabled: true,
          visibility: "public",
          graph: createTestGraph("trigger-updated"),
        },
        context,
      );

      expect(updated.name).toBe("Patient Follow-up Updated");
      expect(updated.description).toBeNull();
      expect(updated.isEnabled).toBeTrue();
      expect(updated.visibility).toBe("public");

      const removeResult = await workflowService.delete(created.id, context);
      expect(removeResult).toEqual({ success: true });

      await expect(
        workflowService.get(created.id, context),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("enforces org isolation for list/get/update/delete", async () => {
      const otherWorkflow = await workflowService.create(
        {
          name: "Secondary Org Workflow",
          graph: createTestGraph("trigger-secondary"),
        },
        otherContext,
      );

      const ownWorkflow = await workflowService.create(
        {
          name: "Primary Org Workflow",
          graph: createTestGraph("trigger-primary"),
        },
        context,
      );

      const listed = await workflowService.list(context);
      expect(listed).toHaveLength(1);
      expect(listed[0]!.id).toBe(ownWorkflow.id);

      await expect(
        workflowService.get(otherWorkflow.id, context),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      await expect(
        workflowService.update(
          otherWorkflow.id,
          { name: "Cross-org update attempt" },
          context,
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      await expect(
        workflowService.delete(otherWorkflow.id, context),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("runtime toggle behavior", () => {
    test("duplicates always reset to disabled", async () => {
      const source = await workflowService.create(
        {
          name: "Enabled Source Workflow",
          graph: createTestGraph("trigger-duplicate-enabled"),
          isEnabled: true,
          visibility: "public",
        },
        context,
      );

      const duplicated = await workflowService.duplicate(source.id, context);

      expect(duplicated.isEnabled).toBeFalse();
      expect(duplicated.visibility).toBe("private");
    });

    test("can disable an enabled workflow", async () => {
      const workflow = await workflowService.create(
        {
          name: "Toggle Workflow",
          graph: createTestGraph("trigger-toggle"),
          isEnabled: true,
        },
        context,
      );

      const updated = await workflowService.update(
        workflow.id,
        {
          isEnabled: false,
        },
        context,
      );

      expect(updated.isEnabled).toBeFalse();
    });

    test("execute rejects workflows that are turned off", async () => {
      const workflow = await workflowService.create(
        {
          name: "Off Workflow",
          graph: createTestGraph("trigger-off-execute"),
          isEnabled: false,
        },
        context,
      );

      await expect(
        workflowService.execute(
          workflow.id,
          {
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
          context,
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });
});
