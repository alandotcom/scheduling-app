import {
  journeyTriggerConfigSchema,
  type DomainEventDataByType,
  type DomainEventType,
  type JourneyTriggerConfig,
  type LinearJourneyGraph,
} from "@scheduling/dto";
import { toRecord } from "../lib/type-guards.js";
import {
  toDataEnvelopeContext,
  toDataEnvelopeContextFromUnknown,
} from "./journey-context-shapes.js";

export type JourneyPlannerDomainEventType = Extract<
  DomainEventType,
  | "appointment.scheduled"
  | "appointment.confirmed"
  | "appointment.rescheduled"
  | "appointment.canceled"
  | "appointment.no_show"
  | "client.created"
  | "client.updated"
>;

export type JourneyPlannerDomainEventPayload =
  DomainEventDataByType[JourneyPlannerDomainEventType];

export type JourneyRunIdentity =
  | {
      triggerEntityType: "appointment";
      triggerEntityId: string;
      appointmentId: string;
      clientId: string | null;
    }
  | {
      triggerEntityType: "client";
      triggerEntityId: string;
      appointmentId: null;
      clientId: string;
    };

type JourneyTriggerResolution =
  | { status: "invalid_config" }
  | { status: "unsupported_trigger_type" }
  | { status: "missing_run_identity" }
  | {
      status: "resolved";
      triggerConfig: JourneyTriggerConfig;
      routing: "ignore";
    }
  | {
      status: "resolved";
      triggerConfig: JourneyTriggerConfig;
      routing: "plan";
      runIdentity: JourneyRunIdentity;
      appointmentContext: Record<string, unknown>;
      clientContext: Record<string, unknown>;
    }
  | {
      status: "resolved";
      triggerConfig: JourneyTriggerConfig;
      routing: "cancel";
      triggerBranch: "canceled" | "no_show";
      runIdentity: JourneyRunIdentity;
      appointmentContext: Record<string, unknown>;
      clientContext: Record<string, unknown>;
    };

function getTriggerConfig(
  graph: LinearJourneyGraph,
): JourneyTriggerConfig | null {
  const triggerNode = graph.nodes.find(
    (node) => node.attributes.data.type === "trigger",
  );

  if (!triggerNode) {
    return null;
  }

  const parsed = journeyTriggerConfigSchema.safeParse(
    triggerNode.attributes.data.config,
  );

  return parsed.success ? parsed.data : null;
}

function resolveAppointmentTriggerRouting(input: {
  triggerConfig: Extract<
    JourneyTriggerConfig,
    { triggerType: "AppointmentJourney" }
  >;
  eventType: JourneyPlannerDomainEventType;
}):
  | { routing: "plan" }
  | { routing: "cancel"; triggerBranch: "canceled" | "no_show" }
  | { routing: "ignore" } {
  if (input.eventType === "appointment.no_show") {
    return { routing: "cancel", triggerBranch: "no_show" };
  }

  if (input.triggerConfig.stop === input.eventType) {
    return { routing: "cancel", triggerBranch: "canceled" };
  }

  if (
    input.triggerConfig.start === input.eventType ||
    input.triggerConfig.restart === input.eventType
  ) {
    return { routing: "plan" };
  }

  return { routing: "ignore" };
}

function resolveClientTriggerRouting(input: {
  triggerConfig: Extract<
    JourneyTriggerConfig,
    { triggerType: "ClientJourney" }
  >;
  eventType: JourneyPlannerDomainEventType;
  payload: JourneyPlannerDomainEventPayload;
}): "plan" | "ignore" {
  if (input.triggerConfig.event === "client.created") {
    return input.eventType === "client.created" ? "plan" : "ignore";
  }

  // client.updated trigger
  if (input.eventType !== "client.updated") {
    return "ignore";
  }

  const { trackedAttributeKey } = input.triggerConfig;
  if (!trackedAttributeKey) {
    return "ignore";
  }

  const payloadRecord = toRecord(input.payload);
  const previousRecord = toRecord(payloadRecord["previous"]);
  const { currentValue, previousValue } = resolveTrackedClientAttributeValues({
    payloadRecord,
    previousRecord,
    trackedAttributeKey,
  });

  if (areTrackedAttributeValuesEqual(currentValue, previousValue)) {
    return "ignore";
  }

  return "plan";
}

function resolveTrackedClientAttributeValues(input: {
  payloadRecord: Record<string, unknown>;
  previousRecord: Record<string, unknown>;
  trackedAttributeKey: string;
}): {
  currentValue: unknown;
  previousValue: unknown;
} {
  if (input.trackedAttributeKey === "client.id") {
    return {
      currentValue:
        input.payloadRecord["clientId"] ?? input.payloadRecord["id"],
      previousValue:
        input.previousRecord["clientId"] ?? input.previousRecord["id"],
    };
  }

  if (input.trackedAttributeKey.startsWith("client.")) {
    const field = input.trackedAttributeKey.slice("client.".length);
    return {
      currentValue: input.payloadRecord[field],
      previousValue: input.previousRecord[field],
    };
  }

  const customAttributes = toRecord(input.payloadRecord["customAttributes"]);
  const previousCustomAttributes = toRecord(
    input.previousRecord["customAttributes"],
  );

  return {
    currentValue: customAttributes[input.trackedAttributeKey],
    previousValue: previousCustomAttributes[input.trackedAttributeKey],
  };
}

function areTrackedAttributeValuesEqual(
  currentValue: unknown,
  previousValue: unknown,
): boolean {
  if (Array.isArray(currentValue) || Array.isArray(previousValue)) {
    if (!Array.isArray(currentValue) || !Array.isArray(previousValue)) {
      return false;
    }

    if (currentValue.length !== previousValue.length) {
      return false;
    }

    for (let index = 0; index < currentValue.length; index += 1) {
      if (currentValue[index] !== previousValue[index]) {
        return false;
      }
    }

    return true;
  }

  return currentValue === previousValue;
}

function resolveClientContextFromPayload(
  payload: JourneyPlannerDomainEventPayload,
): {
  clientId: string | null;
  clientContext: Record<string, unknown>;
} {
  const payloadRecord = toRecord(payload);
  const clientId =
    typeof payloadRecord["clientId"] === "string"
      ? payloadRecord["clientId"]
      : null;

  const clientData: Record<string, unknown> = { ...payloadRecord };
  if (clientId && typeof clientData["id"] !== "string") {
    clientData["id"] = clientId;
  }
  const clientContext = toDataEnvelopeContext(clientData);

  return {
    clientId,
    clientContext,
  };
}

function resolveAppointmentClientIdFromPayload(
  payloadRecord: Record<string, unknown>,
): string | null {
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  if (
    typeof payloadRecord["clientId"] === "string" &&
    isUuid(payloadRecord["clientId"])
  ) {
    return payloadRecord["clientId"];
  }

  const appointmentRecord = toRecord(payloadRecord["appointment"]);
  if (
    typeof appointmentRecord["clientId"] === "string" &&
    isUuid(appointmentRecord["clientId"])
  ) {
    return appointmentRecord["clientId"];
  }

  const clientRecord = toRecord(payloadRecord["client"]);
  if (typeof clientRecord["id"] === "string" && isUuid(clientRecord["id"])) {
    return clientRecord["id"];
  }
  if (
    typeof clientRecord["clientId"] === "string" &&
    isUuid(clientRecord["clientId"])
  ) {
    return clientRecord["clientId"];
  }

  return null;
}

export function resolveJourneyTriggerRuntime(input: {
  graph: LinearJourneyGraph;
  eventType: JourneyPlannerDomainEventType;
  payload: JourneyPlannerDomainEventPayload;
}): JourneyTriggerResolution {
  const triggerConfig = getTriggerConfig(input.graph);
  if (!triggerConfig) {
    return { status: "invalid_config" };
  }

  if (triggerConfig.triggerType === "AppointmentJourney") {
    const routing = resolveAppointmentTriggerRouting({
      triggerConfig,
      eventType: input.eventType,
    });
    if (routing.routing === "ignore") {
      return {
        status: "resolved",
        triggerConfig,
        routing: "ignore",
      };
    }

    const appointmentPayload = toRecord(input.payload);
    const appointmentContext = toDataEnvelopeContext(appointmentPayload);
    const clientContext = toDataEnvelopeContextFromUnknown(
      appointmentPayload["client"],
    );
    const clientId = resolveAppointmentClientIdFromPayload(appointmentPayload);
    const appointmentId =
      typeof appointmentPayload["appointmentId"] === "string"
        ? appointmentPayload["appointmentId"]
        : null;

    if (!appointmentId) {
      return { status: "missing_run_identity" };
    }

    if (routing.routing === "cancel") {
      return {
        status: "resolved",
        triggerConfig,
        routing: "cancel",
        triggerBranch: routing.triggerBranch,
        runIdentity: {
          triggerEntityType: "appointment",
          triggerEntityId: appointmentId,
          appointmentId,
          clientId,
        },
        appointmentContext,
        clientContext,
      };
    }

    return {
      status: "resolved",
      triggerConfig,
      routing: "plan",
      runIdentity: {
        triggerEntityType: "appointment",
        triggerEntityId: appointmentId,
        appointmentId,
        clientId,
      },
      appointmentContext,
      clientContext,
    };
  }

  if (triggerConfig.triggerType === "ClientJourney") {
    const routing = resolveClientTriggerRouting({
      triggerConfig,
      eventType: input.eventType,
      payload: input.payload,
    });
    if (routing === "ignore") {
      return {
        status: "resolved",
        triggerConfig,
        routing: "ignore",
      };
    }

    const { clientId, clientContext } = resolveClientContextFromPayload(
      input.payload,
    );

    if (!clientId) {
      return { status: "missing_run_identity" };
    }

    return {
      status: "resolved",
      triggerConfig,
      routing,
      runIdentity: {
        triggerEntityType: "client",
        triggerEntityId: clientId,
        appointmentId: null,
        clientId,
      },
      appointmentContext: {},
      clientContext,
    };
  }

  return { status: "unsupported_trigger_type" };
}
