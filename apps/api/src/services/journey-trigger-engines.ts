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
      routing: "plan" | "cancel";
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
}): "plan" | "cancel" | "ignore" {
  if (input.triggerConfig.stop === input.eventType) {
    return "cancel";
  }

  if (
    input.triggerConfig.start === input.eventType ||
    input.triggerConfig.restart === input.eventType
  ) {
    return "plan";
  }

  return "ignore";
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
  const customAttributes = toRecord(payloadRecord["customAttributes"]);
  const previousRecord = toRecord(payloadRecord["previous"]);
  const previousCustomAttributes = toRecord(previousRecord["customAttributes"]);

  const currentValue = customAttributes[trackedAttributeKey];
  const previousValue = previousCustomAttributes[trackedAttributeKey];

  if (areTrackedAttributeValuesEqual(currentValue, previousValue)) {
    return "ignore";
  }

  return "plan";
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
    if (routing === "ignore") {
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
    const appointmentId =
      typeof appointmentPayload["appointmentId"] === "string"
        ? appointmentPayload["appointmentId"]
        : null;

    if (!appointmentId) {
      return { status: "missing_run_identity" };
    }

    return {
      status: "resolved",
      triggerConfig,
      routing,
      runIdentity: {
        triggerEntityType: "appointment",
        triggerEntityId: appointmentId,
        appointmentId,
        clientId: null,
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
