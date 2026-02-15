import { describe, expect, test } from "bun:test";
import type {
  DomainEventData,
  DomainEventType,
  SerializedWorkflowGraph,
  WorkflowDomainEventTriggerConfig,
} from "@scheduling/dto";
import { getDomainForDomainEventType } from "@scheduling/dto";
import {
  createTrigger,
  evaluateWorkflowTrigger,
  evaluateWorkflowDomainEventTrigger,
  getWorkflowTriggerConfig,
  registerWorkflowTrigger,
  resolveWorkflowTriggerDefinition,
} from "./workflow-trigger-registry.js";

const DOMAIN_CORRELATION_CASES = [
  {
    eventType: "appointment.created" as const,
    payload: {
      appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d22",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d23",
      clientId: null,
      startAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
      endAt: new Date("2026-01-01T10:30:00.000Z").toISOString(),
      timezone: "UTC",
      status: "scheduled",
      notes: null,
    },
    expectedCorrelationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
  },
  {
    eventType: "calendar.created" as const,
    payload: {
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
      locationId: null,
      name: "Main calendar",
      color: null,
      timezone: "UTC",
    },
    expectedCorrelationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24",
  },
  {
    eventType: "appointment_type.created" as const,
    payload: {
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d25",
      name: "Follow up",
      slug: "follow-up",
      durationMinutes: 30,
      color: null,
      isActive: true,
      category: null,
      description: null,
      requiresConfirmation: false,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      maxAdvanceBookingDays: null,
      minAdvanceBookingMinutes: null,
      cancellationPolicyHours: null,
      metadata: null,
    },
    expectedCorrelationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d25",
  },
  {
    eventType: "resource.created" as const,
    payload: {
      resourceId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d26",
      name: "Room A",
      type: "room",
      quantity: 1,
      color: null,
      description: null,
      isActive: true,
      metadata: null,
    },
    expectedCorrelationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d26",
  },
  {
    eventType: "location.created" as const,
    payload: {
      locationId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d27",
      name: "HQ",
      address: null,
      timezone: "UTC",
      isActive: true,
    },
    expectedCorrelationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d27",
  },
  {
    eventType: "client.created" as const,
    payload: {
      clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d28",
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
    },
    expectedCorrelationKey: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d28",
  },
];

function createTriggerConfig(
  overrides: Partial<WorkflowDomainEventTriggerConfig> = {},
): WorkflowDomainEventTriggerConfig {
  const defaultConfig: WorkflowDomainEventTriggerConfig = {
    triggerType: "DomainEvent",
    domain: "appointment",
    startEvents: ["appointment.created"],
    restartEvents: ["appointment.updated"],
    stopEvents: ["appointment.deleted"],
  };

  const merged = {
    ...defaultConfig,
    ...overrides,
  };

  const inferredDomainEvent =
    merged.startEvents[0] ?? merged.restartEvents[0] ?? merged.stopEvents[0];

  return {
    ...merged,
    domain:
      overrides.domain ??
      (inferredDomainEvent
        ? getDomainForDomainEventType(inferredDomainEvent)
        : defaultConfig.domain),
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
      notes: null,
    } as DomainEventData<TEventType>;
  }

  return {
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d04",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
    phone: null,
  } as DomainEventData<TEventType>;
}

describe("workflow trigger registry", () => {
  test("falls back to DomainEvent trigger when config is missing", () => {
    const trigger = resolveWorkflowTriggerDefinition(undefined);

    expect(trigger.type).toBe("DomainEvent");
    expect(trigger.executionType).toBe("domain_event");
  });

  test("supports registering a custom trigger definition", () => {
    registerWorkflowTrigger(
      createTrigger({
        type: "InternalQueue",
        executionType: "domain_event",
        evaluate(input) {
          return {
            triggerType: "InternalQueue",
            executionType: "domain_event",
            eventType: input.eventType,
            correlationKey: "queue-job-1",
            routingDecision: { kind: "start" },
          };
        },
      }),
    );

    const evaluation = evaluateWorkflowTrigger({
      config: {
        triggerType: "InternalQueue",
      } as Record<string, unknown>,
      eventType: "client.created",
      payload: createPayload("client.created") as Record<string, unknown>,
    });

    expect(evaluation.triggerType).toBe("InternalQueue");
    expect(evaluation.routingDecision).toEqual({ kind: "start" });
    expect(evaluation.correlationKey).toBe("queue-job-1");
  });

  test("extracts domain-event trigger config from workflow graph", () => {
    const graph: SerializedWorkflowGraph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger-1",
          attributes: {
            id: "trigger-1",
            type: "trigger-node",
            position: { x: 0, y: 0 },
            data: {
              label: "Trigger",
              type: "trigger",
              config: {
                triggerType: "DomainEvent",
                domain: "client",
                startEvents: ["client.created"],
                restartEvents: ["client.updated"],
                stopEvents: ["client.deleted"],
              },
            },
          },
        },
      ],
      edges: [],
    };

    const config = getWorkflowTriggerConfig(graph);

    expect(config).toEqual({
      triggerType: "DomainEvent",
      domain: "client",
      startEvents: ["client.created"],
      restartEvents: ["client.updated"],
      stopEvents: ["client.deleted"],
    });
  });

  test.each(
    DOMAIN_CORRELATION_CASES,
  )("derives default correlation key for $eventType", ({
    eventType,
    payload,
    expectedCorrelationKey,
  }) => {
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig({
        startEvents: [eventType],
        restartEvents: [],
        stopEvents: [],
      }),
      eventType,
      payload,
    });

    expect(evaluation.routingDecision).toEqual({ kind: "start" });
    expect(evaluation.correlationKey).toBe(expectedCorrelationKey);
  });

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

  test("returns ignore when event domain differs from configured domain", () => {
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig({
        domain: "client",
        startEvents: ["client.created"],
        restartEvents: ["client.updated"],
        stopEvents: ["client.deleted"],
      }),
      eventType: "appointment.created",
      payload: createPayload("appointment.created") as Record<string, unknown>,
    });

    expect(evaluation.routingDecision).toEqual({
      kind: "ignore",
      reason: "event_not_configured",
    });
  });

  test("prioritizes stop over restart/start for overlapping routing sets", () => {
    const eventType = "appointment.updated" as const;
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig({
        startEvents: [eventType],
        restartEvents: [eventType],
        stopEvents: [eventType],
      }),
      eventType,
      payload: createPayload(eventType) as Record<string, unknown>,
    });

    expect(evaluation.routingDecision).toEqual({ kind: "stop" });
  });

  test("prioritizes restart over start for overlapping routing sets", () => {
    const eventType = "appointment.updated" as const;
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig({
        startEvents: [eventType],
        restartEvents: [eventType],
        stopEvents: [],
      }),
      eventType,
      payload: createPayload(eventType) as Record<string, unknown>,
    });

    expect(evaluation.routingDecision).toEqual({ kind: "restart" });
  });

  test("returns missing_event_type when event type is undefined", () => {
    const evaluation = evaluateWorkflowDomainEventTrigger({
      config: createTriggerConfig(),
      eventType: undefined,
      payload: createPayload("appointment.created") as Record<string, unknown>,
    });

    expect(evaluation.routingDecision).toEqual({
      kind: "ignore",
      reason: "missing_event_type",
    });
    expect(evaluation.correlationKey).toBeUndefined();
  });

  test("returns ignore when unknown trigger type is configured", () => {
    const evaluation = evaluateWorkflowTrigger({
      config: { triggerType: "UnknownTrigger" } as Record<string, unknown>,
      eventType: "client.created",
      payload: createPayload("client.created") as Record<string, unknown>,
    });

    expect(evaluation.triggerType).toBe("UnknownTrigger");
    expect(evaluation.routingDecision).toEqual({
      kind: "ignore",
      reason: "event_not_configured",
    });
    expect(evaluation.correlationKey).toBeUndefined();
  });
});
