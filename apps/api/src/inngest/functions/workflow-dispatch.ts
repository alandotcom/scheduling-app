import { forEachAsync } from "es-toolkit/array";
import {
  webhookEventDataSchemaByType,
  webhookEventTypes,
  type WebhookEventType,
} from "@scheduling/dto";
import { inngest } from "../client.js";
import {
  listEnabledWorkflowDispatchTargets,
  type WorkflowDispatchTarget,
} from "../../services/workflows/runtime.js";

type ResolveDispatchTargets = (
  orgId: string,
  eventType: WebhookEventType,
) => Promise<readonly WorkflowDispatchTarget[]>;

type WorkflowTriggeredEventPayload = {
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
      type: WebhookEventType;
      timestamp: string;
      payload: Record<string, unknown>;
    };
    entity: {
      type: string;
      id: string;
    };
  };
};

type DispatchWorkflowTriggeredEvent = (
  event: WorkflowTriggeredEventPayload,
) => Promise<void>;

const ENTITY_BY_EVENT_TYPE: Record<
  WebhookEventType,
  { entityType: string; idField: string }
> = {
  "appointment.created": {
    entityType: "appointment",
    idField: "appointmentId",
  },
  "appointment.updated": {
    entityType: "appointment",
    idField: "appointmentId",
  },
  "appointment.cancelled": {
    entityType: "appointment",
    idField: "appointmentId",
  },
  "appointment.rescheduled": {
    entityType: "appointment",
    idField: "appointmentId",
  },
  "appointment.no_show": {
    entityType: "appointment",
    idField: "appointmentId",
  },
  "calendar.created": {
    entityType: "calendar",
    idField: "calendarId",
  },
  "calendar.updated": {
    entityType: "calendar",
    idField: "calendarId",
  },
  "calendar.deleted": {
    entityType: "calendar",
    idField: "calendarId",
  },
  "appointment_type.created": {
    entityType: "appointment_type",
    idField: "appointmentTypeId",
  },
  "appointment_type.updated": {
    entityType: "appointment_type",
    idField: "appointmentTypeId",
  },
  "appointment_type.deleted": {
    entityType: "appointment_type",
    idField: "appointmentTypeId",
  },
  "resource.created": {
    entityType: "resource",
    idField: "resourceId",
  },
  "resource.updated": {
    entityType: "resource",
    idField: "resourceId",
  },
  "resource.deleted": {
    entityType: "resource",
    idField: "resourceId",
  },
  "location.created": {
    entityType: "location",
    idField: "locationId",
  },
  "location.updated": {
    entityType: "location",
    idField: "locationId",
  },
  "location.deleted": {
    entityType: "location",
    idField: "locationId",
  },
  "client.created": {
    entityType: "client",
    idField: "clientId",
  },
  "client.updated": {
    entityType: "client",
    idField: "clientId",
  },
  "client.deleted": {
    entityType: "client",
    idField: "clientId",
  },
};

function defaultDispatchWorkflowTriggeredEvent(
  event: WorkflowTriggeredEventPayload,
): Promise<void> {
  return inngest.send(event).then(() => {});
}

function resolveEntityReference(
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
): { type: string; id: string } {
  const entityConfig = ENTITY_BY_EVENT_TYPE[eventType];
  const candidateId = payload[entityConfig.idField];

  if (typeof candidateId !== "string" || candidateId.length === 0) {
    throw new Error(
      `Missing "${entityConfig.idField}" in payload for event type "${eventType}"`,
    );
  }

  return {
    type: entityConfig.entityType,
    id: candidateId,
  };
}

function buildSourceEventId(eventType: WebhookEventType, event: {
  id?: string | undefined;
  ts?: number | undefined;
  data: { orgId: string };
}): string {
  return event.id ?? `${eventType}:${event.data.orgId}:${event.ts ?? 0}`;
}

export function createWorkflowDispatchFunction<TEventType extends WebhookEventType>(
  eventType: TEventType,
  resolveTargets: ResolveDispatchTargets = listEnabledWorkflowDispatchTargets,
  dispatchWorkflowTriggeredEvent: DispatchWorkflowTriggeredEvent = defaultDispatchWorkflowTriggeredEvent,
) {
  return inngest.createFunction(
    {
      id: `workflow-dispatch-${eventType.replaceAll(".", "-")}`,
      retries: 10,
    },
    { event: eventType },
    async ({ event, step }) => {
      const { orgId, ...payloadInput } = event.data;
      const payloadValidation =
        webhookEventDataSchemaByType[eventType].safeParse(payloadInput);

      if (!payloadValidation.success) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      const payload = payloadValidation.data;
      const sourceEventId = buildSourceEventId(eventType, event);
      const sourceEventTimestamp = new Date(event.ts ?? Date.now()).toISOString();
      const entity = resolveEntityReference(eventType, payload);

      const targets = await step.run("resolve-workflow-bindings", async () => {
        return resolveTargets(orgId, eventType);
      });

      if (targets.length === 0) {
        return {
          sourceEventId,
          sourceEventType: eventType,
          orgId,
          scheduledWorkflowCount: 0,
        };
      }

      const scheduledWorkflowCount = await step.run(
        "schedule-workflow-runs",
        async () => {
          await forEachAsync(
            targets,
            async (target) => {
              const triggeredEventId = `${sourceEventId}:${target.definitionId}:${target.versionId}`;

              await dispatchWorkflowTriggeredEvent({
                id: triggeredEventId,
                name: "scheduling/workflow.triggered",
                data: {
                  orgId,
                  workflow: {
                    definitionId: target.definitionId,
                    versionId: target.versionId,
                    workflowType: target.workflowType,
                  },
                  sourceEvent: {
                    id: sourceEventId,
                    type: eventType,
                    timestamp: sourceEventTimestamp,
                    payload,
                  },
                  entity,
                },
              });
            },
            { concurrency: 1 },
          );

          return targets.length;
        },
      );

      return {
        sourceEventId,
        sourceEventType: eventType,
        orgId,
        scheduledWorkflowCount,
      };
    },
  );
}

export const workflowDispatchFunctions = webhookEventTypes.map((eventType) =>
  createWorkflowDispatchFunction(eventType),
);
