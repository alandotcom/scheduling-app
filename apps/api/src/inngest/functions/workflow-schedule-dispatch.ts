import { CronExpressionParser } from "cron-parser";
import { forEachAsync } from "es-toolkit/array";
import { orgs } from "@scheduling/db/schema";
import { db } from "../../lib/db.js";
import {
  listDueWorkflowScheduleDispatchTargets,
  updateWorkflowScheduleBindingNextRunAt,
  type WorkflowScheduleDispatchTarget,
} from "../../services/workflows/runtime.js";
import { inngest } from "../client.js";

type WorkflowTriggeredScheduleEvent = {
  id: string;
  name: "scheduling/workflow.triggered";
  data: {
    orgId: string;
    workflow: {
      definitionId: string;
      versionId: string;
      workflowType: string;
    };
    sourceEvent: {
      id: string;
      type: "schedule.triggered";
      timestamp: string;
      payload: Record<string, unknown>;
    };
    entity: {
      type: "workflow";
      id: string;
    };
  };
};

type WorkflowScheduleDispatchDependencies = {
  now: () => Date;
  listOrgIds: () => Promise<string[]>;
  listDueTargets: (input: {
    orgId: string;
    now: Date;
  }) => Promise<readonly WorkflowScheduleDispatchTarget[]>;
  updateNextRunAt: (input: {
    orgId: string;
    bindingId: string;
    nextRunAt: Date | null;
  }) => Promise<void>;
  dispatchTriggeredEvent: (
    event: WorkflowTriggeredScheduleEvent,
  ) => Promise<void>;
};

function computeNextScheduleRunAt(input: {
  expression: string;
  timezone: string;
  currentDate: Date;
}): Date | null {
  try {
    const parsed = CronExpressionParser.parse(input.expression, {
      currentDate: input.currentDate,
      tz: input.timezone,
    });
    return parsed.next().toDate();
  } catch {
    return null;
  }
}

function buildScheduleEventId(input: {
  orgId: string;
  definitionId: string;
  versionId: string;
  minuteBucketMs: number;
}): string {
  return [
    "schedule",
    input.orgId,
    input.definitionId,
    input.versionId,
    String(input.minuteBucketMs),
  ].join(":");
}

async function defaultDispatchTriggeredEvent(
  event: WorkflowTriggeredScheduleEvent,
) {
  await inngest.send(event);
}

async function defaultListOrgIds(): Promise<string[]> {
  const rows = await db.select({ id: orgs.id }).from(orgs);
  return rows.map((row) => row.id);
}

function createDefaultDependencies(): WorkflowScheduleDispatchDependencies {
  return {
    now: () => new Date(),
    listOrgIds: defaultListOrgIds,
    listDueTargets: listDueWorkflowScheduleDispatchTargets,
    updateNextRunAt: updateWorkflowScheduleBindingNextRunAt,
    dispatchTriggeredEvent: defaultDispatchTriggeredEvent,
  };
}

async function processDueScheduleTarget(input: {
  now: Date;
  orgId: string;
  target: WorkflowScheduleDispatchTarget;
  updateNextRunAt: WorkflowScheduleDispatchDependencies["updateNextRunAt"];
  dispatchTriggeredEvent: WorkflowScheduleDispatchDependencies["dispatchTriggeredEvent"];
}) {
  const minuteBucketMs = Math.floor(input.now.getTime() / 60_000) * 60_000;
  const eventId = buildScheduleEventId({
    orgId: input.orgId,
    definitionId: input.target.definitionId,
    versionId: input.target.versionId,
    minuteBucketMs,
  });

  const sourceTimestamp = input.now.toISOString();

  await input.dispatchTriggeredEvent({
    id: eventId,
    name: "scheduling/workflow.triggered",
    data: {
      orgId: input.orgId,
      workflow: {
        definitionId: input.target.definitionId,
        versionId: input.target.versionId,
        workflowType: input.target.workflowType,
      },
      sourceEvent: {
        id: eventId,
        type: "schedule.triggered",
        timestamp: sourceTimestamp,
        payload: {
          scheduleExpression: input.target.scheduleExpression,
          scheduleTimezone: input.target.scheduleTimezone,
          triggeredAt: sourceTimestamp,
        },
      },
      entity: {
        type: "workflow",
        id: input.target.definitionId,
      },
    },
  });

  const nextRunAt = computeNextScheduleRunAt({
    expression: input.target.scheduleExpression,
    timezone: input.target.scheduleTimezone,
    currentDate: input.now,
  });

  await input.updateNextRunAt({
    orgId: input.orgId,
    bindingId: input.target.bindingId,
    nextRunAt,
  });
}

export function createWorkflowScheduleDispatchFunction(
  dependencyOverrides: Partial<WorkflowScheduleDispatchDependencies> = {},
) {
  const dependencies: WorkflowScheduleDispatchDependencies = {
    ...createDefaultDependencies(),
    ...dependencyOverrides,
  };

  return inngest.createFunction(
    {
      id: "workflow-schedule-dispatch",
      retries: 3,
    },
    { cron: "* * * * *" },
    async ({ step }) => {
      const now = dependencies.now();
      const orgIds = await step.run("list-org-ids", async () =>
        dependencies.listOrgIds(),
      );
      let dispatchedRunCount = 0;

      await forEachAsync(
        orgIds,
        async (orgId) => {
          const dueTargets = await step.run(
            `list-due-workflow-schedules-${orgId}`,
            async () =>
              dependencies.listDueTargets({
                orgId,
                now,
              }),
          );

          if (dueTargets.length === 0) {
            return;
          }

          await forEachAsync(
            dueTargets,
            async (target) => {
              await processDueScheduleTarget({
                now,
                orgId,
                target,
                updateNextRunAt: dependencies.updateNextRunAt,
                dispatchTriggeredEvent: dependencies.dispatchTriggeredEvent,
              });
              dispatchedRunCount += 1;
            },
            { concurrency: 1 },
          );
        },
        { concurrency: 1 },
      );

      return {
        scheduledAt: now.toISOString(),
        dispatchedRunCount,
      };
    },
  );
}

export const workflowScheduleDispatchFunction =
  createWorkflowScheduleDispatchFunction();
