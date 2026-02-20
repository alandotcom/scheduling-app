import {
  journeyTriggerConfigSchema,
  type DomainEventDataByType,
  type DomainEventType,
  type JourneyTriggerConfig,
  type LinearJourneyGraph,
} from "@scheduling/dto";
import { toRecord } from "../lib/type-guards.js";

export type JourneyPlannerDomainEventType = Extract<
  DomainEventType,
  "appointment.scheduled" | "appointment.rescheduled" | "appointment.canceled"
>;

export type JourneyPlannerDomainEventPayload =
  DomainEventDataByType[JourneyPlannerDomainEventType];

export type JourneyRunIdentity = {
  triggerEntityType: "appointment";
  triggerEntityId: string;
  appointmentId: string;
  clientId: string | null;
};

type JourneyTriggerResolution =
  | { status: "invalid_config" }
  | { status: "unsupported_trigger_type" }
  | { status: "missing_run_identity" }
  | {
      status: "resolved";
      triggerConfig: JourneyTriggerConfig;
      routing: "plan" | "cancel" | "ignore";
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

export function resolveJourneyTriggerRuntime(input: {
  graph: LinearJourneyGraph;
  eventType: JourneyPlannerDomainEventType;
  payload: JourneyPlannerDomainEventPayload;
}): JourneyTriggerResolution {
  const triggerConfig = getTriggerConfig(input.graph);
  if (!triggerConfig) {
    return { status: "invalid_config" };
  }

  if (triggerConfig.triggerType !== "AppointmentJourney") {
    return { status: "unsupported_trigger_type" };
  }

  const appointmentContext = toRecord(input.payload);
  const clientContext = toRecord(appointmentContext["client"]);
  const appointmentId =
    typeof appointmentContext["appointmentId"] === "string"
      ? appointmentContext["appointmentId"]
      : null;

  if (!appointmentId) {
    return { status: "missing_run_identity" };
  }

  return {
    status: "resolved",
    triggerConfig,
    routing: resolveAppointmentTriggerRouting({
      triggerConfig,
      eventType: input.eventType,
    }),
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
