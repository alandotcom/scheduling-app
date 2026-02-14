import { describe, expect, test } from "bun:test";
import type {
  DomainEventData,
  DomainEventType,
  WorkflowDomainEventTriggerConfig,
} from "@scheduling/dto";
import { evaluateWorkflowDomainEventTrigger } from "./workflow-trigger-registry.js";

function createTriggerConfig(
  overrides: Partial<WorkflowDomainEventTriggerConfig> = {},
): WorkflowDomainEventTriggerConfig {
  return {
    triggerType: "DomainEvent",
    startEvents: ["appointment.created"],
    restartEvents: ["appointment.updated"],
    stopEvents: ["appointment.cancelled"],
    ...overrides,
  };
}

function createPayload<TEventType extends DomainEventType>(
  type: TEventType,
): DomainEventData<TEventType> {
  if (type.startsWith("appointment.")) {
    return {
      appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d02",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d03",
      clientId: null,
      startAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
      endAt: new Date("2026-01-01T10:30:00.000Z").toISOString(),
      timezone: "UTC",
      status: "scheduled",
    } as DomainEventData<TEventType>;
  }

  return {
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
  } as DomainEventData<TEventType>;
}

describe("workflow trigger registry", () => {
  test("maps domain prefix to default correlation field", () => {
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig({
        startEvents: ["client.created"],
        restartEvents: [],
        stopEvents: [],
      }),
      eventType: "client.created",
      payload: createPayload("client.created") as Record<string, unknown>,
    });

    expect(evaluation.routingDecision).toEqual({ kind: "start" });
    expect(evaluation.correlationKey).toBe(
      "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
    );
  });

  test("uses explicit correlation path override", () => {
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig({
        domainEventCorrelationPath: "entity.id",
      }),
      eventType: "appointment.created",
      payload: {
        entity: {
          id: "custom-correlation",
        },
      },
    });

    expect(evaluation.correlationKey).toBe("custom-correlation");
    expect(evaluation.metadata).toEqual({ correlationPath: "entity.id" });
  });

  test("returns ignore when event not in routing sets", () => {
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig(),
      eventType: "calendar.created",
      payload: {
        calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d05",
      },
    });

    expect(evaluation.routingDecision).toEqual({
      kind: "ignore",
      reason: "event_not_configured",
    });
  });
});
