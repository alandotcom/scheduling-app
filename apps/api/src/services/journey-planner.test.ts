import { beforeEach, describe, expect, mock, test } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import {
  appointments,
  calendars,
  clientCustomAttributeDefinitions,
  journeyDeliveries,
  journeyRuns,
  journeyVersions,
} from "@scheduling/db/schema";
import type {
  JourneyTriggerFilterAst,
  LinearJourneyGraph,
} from "@scheduling/dto";
import {
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import { createOrg, createQuickAppointment } from "../test-utils/factories.js";
import type { ServiceContext } from "./locations.js";
import { clientCustomAttributeService } from "./client-custom-attributes.js";
import { deliveryActionTypes } from "./delivery-provider-registry.js";
import { journeyService } from "./journeys.js";
import {
  processJourneyDomainEvent as processJourneyDomainEventBase,
  executeWaitForConfirmationTimeout as executeWaitForConfirmationTimeoutBase,
  executeWaitResume as executeWaitResumeBase,
} from "./journey-planner.js";

registerDbTestReset("per-file");

const db: TestDatabase = getTestDb();
const defaultScheduleRequester = mock(
  async (): Promise<{ eventId?: string }> => ({}),
);
const defaultCancelRequester = mock(
  async (): Promise<{ eventId?: string }> => ({}),
);
const defaultProviderRequesters = Object.fromEntries(
  deliveryActionTypes.map((actionType) => [actionType, defaultScheduleRequester]),
);

beforeEach(() => {
  defaultScheduleRequester.mockReset();
  defaultCancelRequester.mockReset();
  defaultScheduleRequester.mockResolvedValue({});
  defaultCancelRequester.mockResolvedValue({});
});

function processJourneyDomainEvent(
  ...args: Parameters<typeof processJourneyDomainEventBase>
) {
  const [event, dependencies] = args;
  const providerRequesters = {
    ...defaultProviderRequesters,
    ...dependencies?.providerRequesters,
  };

  return processJourneyDomainEventBase(event, {
    ...dependencies,
    providerRequesters,
    cancelRequester: dependencies?.cancelRequester ?? defaultCancelRequester,
  });
}

function executeWaitResume(...args: Parameters<typeof executeWaitResumeBase>) {
  const [input, dependencies] = args;

  return executeWaitResumeBase(input, {
    ...dependencies,
    scheduleRequester:
      dependencies?.scheduleRequester ?? defaultScheduleRequester,
    cancelRequester: dependencies?.cancelRequester ?? defaultCancelRequester,
  });
}

function executeWaitForConfirmationTimeout(
  ...args: Parameters<typeof executeWaitForConfirmationTimeoutBase>
) {
  const [input, dependencies] = args;

  return executeWaitForConfirmationTimeoutBase(input, {
    ...dependencies,
    scheduleRequester:
      dependencies?.scheduleRequester ?? defaultScheduleRequester,
    cancelRequester: dependencies?.cancelRequester ?? defaultCancelRequester,
  });
}

function createTriggerConfig(input?: { filter?: JourneyTriggerFilterAst }) {
  return {
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
    ...(input?.filter ? { filter: input.filter } : {}),
  } as const;
}

function createJourneyGraph(input?: {
  filter?: JourneyTriggerFilterAst;
  waitDuration?: string;
  waitUntil?: string;
  waitOffset?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(
              input?.filter ? { filter: input.filter } : undefined,
            ),
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              ...(input?.waitDuration
                ? { waitDuration: input.waitDuration }
                : {}),
              ...(input?.waitUntil ? { waitUntil: input.waitUntil } : {}),
              ...(input?.waitOffset ? { waitOffset: input.waitOffset } : {}),
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Send",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "wait-to-send",
        source: "wait-node",
        target: "send-node",
        attributes: {
          id: "wait-to-send",
          source: "wait-node",
          target: "send-node",
        },
      },
    ],
  };
}

function createWaitForConfirmationJourneyGraph(input?: {
  confirmationGraceMinutes?: number;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-confirmation-node",
        attributes: {
          id: "wait-confirmation-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait For Confirmation",
            config: {
              actionType: "wait-for-confirmation",
              confirmationGraceMinutes: input?.confirmationGraceMinutes ?? 0,
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Send",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait-confirmation",
        source: "trigger-node",
        target: "wait-confirmation-node",
        attributes: {
          id: "trigger-to-wait-confirmation",
          source: "trigger-node",
          target: "wait-confirmation-node",
        },
      },
      {
        key: "wait-confirmation-to-send",
        source: "wait-confirmation-node",
        target: "send-node",
        attributes: {
          id: "wait-confirmation-to-send",
          source: "wait-confirmation-node",
          target: "send-node",
        },
      },
    ],
  };
}

function createClientUpdatedJourneyGraph(input?: {
  trackedAttributeKey?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Client Trigger",
            config: {
              triggerType: "ClientJourney",
              event: "client.updated",
              correlationKey: "clientId",
              trackedAttributeKey:
                input?.trackedAttributeKey ?? "membershipTier",
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: 0, y: 140 },
          data: {
            type: "action",
            label: "Send",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-send",
        source: "trigger-node",
        target: "send-node",
        attributes: {
          id: "trigger-to-send",
          source: "trigger-node",
          target: "send-node",
        },
      },
    ],
  };
}

function createLoggerJourneyGraph(input?: {
  waitDuration?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: input?.waitDuration ?? "10m",
            },
          },
        },
      },
      {
        key: "logger-node",
        attributes: {
          id: "logger-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Logger",
            config: {
              actionType: "logger",
              message: "Timeline marker",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "wait-to-logger",
        source: "wait-node",
        target: "logger-node",
        attributes: {
          id: "wait-to-logger",
          source: "wait-node",
          target: "logger-node",
        },
      },
    ],
  };
}

function createResendTemplateJourneyGraph(input?: {
  waitDuration?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: input?.waitDuration ?? "15m",
            },
          },
        },
      },
      {
        key: "send-template-node",
        attributes: {
          id: "send-template-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Send Template",
            config: {
              actionType: "send-resend-template",
              templateIdOrAlias: "appointment-reminder",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "wait-to-send-template",
        source: "wait-node",
        target: "send-template-node",
        attributes: {
          id: "wait-to-send-template",
          source: "wait-node",
          target: "send-template-node",
        },
      },
    ],
  };
}

function createTwilioJourneyGraph(input?: {
  waitDuration?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: input?.waitDuration ?? "5m",
            },
          },
        },
      },
      {
        key: "send-sms-node",
        attributes: {
          id: "send-sms-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Send SMS",
            config: {
              actionType: "send-twilio",
              message: "Reminder for @Appointment.data.startAt",
              toPhone: "@Appointment.data.client.phone",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "wait-to-send-sms",
        source: "wait-node",
        target: "send-sms-node",
        attributes: {
          id: "wait-to-send-sms",
          source: "wait-node",
          target: "send-sms-node",
        },
      },
    ],
  };
}

function createTriggerBranchJourneyGraph(input?: {
  waitDuration?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: -100, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: input?.waitDuration ?? "2h",
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: -100, y: 240 },
          data: {
            type: "action",
            label: "Send",
            config: { actionType: "send-resend" },
          },
        },
      },
      {
        key: "cancel-logger-node",
        attributes: {
          id: "cancel-logger-node",
          type: "action-node",
          position: { x: 100, y: 120 },
          data: {
            type: "action",
            label: "Cancel Logger",
            config: { actionType: "logger", message: "Canceled" },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
          data: { triggerBranch: "scheduled" },
        },
      },
      {
        key: "wait-to-send",
        source: "wait-node",
        target: "send-node",
        attributes: {
          id: "wait-to-send",
          source: "wait-node",
          target: "send-node",
        },
      },
      {
        key: "trigger-to-cancel-logger",
        source: "trigger-node",
        target: "cancel-logger-node",
        attributes: {
          id: "trigger-to-cancel-logger",
          source: "trigger-node",
          target: "cancel-logger-node",
          data: { triggerBranch: "canceled" },
        },
      },
    ],
  };
}

function createFanoutJourneyGraph(): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "logger-node",
        attributes: {
          id: "logger-node",
          type: "action-node",
          position: { x: -100, y: 140 },
          data: {
            type: "action",
            label: "Logger",
            config: {
              actionType: "logger",
              message: "Left branch",
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: 100, y: 140 },
          data: {
            type: "action",
            label: "Send",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-logger",
        source: "trigger-node",
        target: "logger-node",
        attributes: {
          id: "trigger-to-logger",
          source: "trigger-node",
          target: "logger-node",
          data: { triggerBranch: "scheduled" },
        },
      },
      {
        key: "trigger-to-send",
        source: "trigger-node",
        target: "send-node",
        attributes: {
          id: "trigger-to-send",
          source: "trigger-node",
          target: "send-node",
          data: { triggerBranch: "canceled" },
        },
      },
    ],
  };
}

function createConditionJourneyGraph(input?: {
  expression?: string;
  includeTrueEdge?: boolean;
  includeFalseEdge?: boolean;
}): LinearJourneyGraph {
  const includeTrueEdge = input?.includeTrueEdge ?? true;
  const includeFalseEdge = input?.includeFalseEdge ?? true;

  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "condition-node",
        attributes: {
          id: "condition-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Condition",
            config: {
              actionType: "condition",
              expression: input?.expression ?? "true",
            },
          },
        },
      },
      ...(includeTrueEdge
        ? [
            {
              key: "send-true-node",
              attributes: {
                id: "send-true-node",
                type: "action-node",
                position: { x: -160, y: 240 },
                data: {
                  type: "action" as const,
                  label: "Send True",
                  config: {
                    actionType: "send-resend",
                  },
                },
              },
            },
          ]
        : []),
      ...(includeFalseEdge
        ? [
            {
              key: "send-false-node",
              attributes: {
                id: "send-false-node",
                type: "action-node",
                position: { x: 160, y: 240 },
                data: {
                  type: "action" as const,
                  label: "Send False",
                  config: {
                    actionType: "send-slack",
                  },
                },
              },
            },
          ]
        : []),
    ],
    edges: [
      {
        key: "trigger-to-condition",
        source: "trigger-node",
        target: "condition-node",
        attributes: {
          id: "trigger-to-condition",
          source: "trigger-node",
          target: "condition-node",
        },
      },
      ...(includeTrueEdge
        ? [
            {
              key: "condition-to-send-true",
              source: "condition-node",
              target: "send-true-node",
              attributes: {
                id: "condition-to-send-true",
                source: "condition-node",
                target: "send-true-node",
                label: "True",
                data: { conditionBranch: "true" },
              },
            },
          ]
        : []),
      ...(includeFalseEdge
        ? [
            {
              key: "condition-to-send-false",
              source: "condition-node",
              target: "send-false-node",
              attributes: {
                id: "condition-to-send-false",
                source: "condition-node",
                target: "send-false-node",
                label: "False",
                data: { conditionBranch: "false" },
              },
            },
          ]
        : []),
    ],
  };
}

function createWaitConditionJourneyGraph(input?: {
  expression?: string;
  waitDuration?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              waitDuration: input?.waitDuration ?? "1h",
            },
          },
        },
      },
      {
        key: "condition-node",
        attributes: {
          id: "condition-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Condition",
            config: {
              actionType: "condition",
              expression: input?.expression ?? "true",
            },
          },
        },
      },
      {
        key: "send-true-node",
        attributes: {
          id: "send-true-node",
          type: "action-node",
          position: { x: -160, y: 360 },
          data: {
            type: "action",
            label: "Send True",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
      {
        key: "send-false-node",
        attributes: {
          id: "send-false-node",
          type: "action-node",
          position: { x: 160, y: 360 },
          data: {
            type: "action",
            label: "Send False",
            config: {
              actionType: "send-slack",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "wait-to-condition",
        source: "wait-node",
        target: "condition-node",
        attributes: {
          id: "wait-to-condition",
          source: "wait-node",
          target: "condition-node",
        },
      },
      {
        key: "condition-to-send-true",
        source: "condition-node",
        target: "send-true-node",
        attributes: {
          id: "condition-to-send-true",
          source: "condition-node",
          target: "send-true-node",
          label: "True",
          data: { conditionBranch: "true" },
        },
      },
      {
        key: "condition-to-send-false",
        source: "condition-node",
        target: "send-false-node",
        attributes: {
          id: "condition-to-send-false",
          source: "condition-node",
          target: "send-false-node",
          label: "False",
          data: { conditionBranch: "false" },
        },
      },
    ],
  };
}

function createAppointmentPayload(input?: {
  appointmentId?: string;
  timezone?: string;
  previousTimezone?: string;
  status?: "scheduled" | "confirmed" | "cancelled" | "no_show";
  calendarRequiresConfirmation?: boolean;
}) {
  const appointmentId =
    input?.appointmentId ?? "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d10";
  const clientId = "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13";

  const payload = {
    appointmentId,
    calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
    clientId,
    startAt: "2026-03-10T14:00:00.000Z",
    endAt: "2026-03-10T15:00:00.000Z",
    timezone: input?.timezone ?? "America/New_York",
    status: input?.status ?? ("scheduled" as const),
    calendarRequiresConfirmation: input?.calendarRequiresConfirmation ?? false,
    notes: null,
    appointment: {
      id: appointmentId,
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
      clientId,
      startAt: "2026-03-10T14:00:00.000Z",
      endAt: "2026-03-10T15:00:00.000Z",
      timezone: input?.timezone ?? "America/New_York",
      status: input?.status ?? ("scheduled" as const),
      calendarRequiresConfirmation:
        input?.calendarRequiresConfirmation ?? false,
      notes: null,
    },
    client: {
      id: clientId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      customAttributes: {},
    },
  };

  if (!input?.previousTimezone) {
    return payload;
  }

  return {
    ...payload,
    previous: {
      ...payload,
      timezone: input.previousTimezone,
      appointment: {
        ...payload.appointment,
        timezone: input.previousTimezone,
      },
    },
  };
}

function createClientUpdatedPayload(input?: {
  clientId?: string;
  trackedAttributeKey?: string;
  previousValue?: string;
  nextValue?: string;
}) {
  const clientId = input?.clientId ?? "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d24";
  const trackedAttributeKey = input?.trackedAttributeKey ?? "membershipTier";
  const previousValue = input?.previousValue ?? "silver";
  const nextValue = input?.nextValue ?? "gold";

  return {
    clientId,
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    phone: "+14155552671",
    customAttributes: {
      [trackedAttributeKey]: nextValue,
    },
    previous: {
      clientId,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      phone: "+14155552671",
      customAttributes: {
        [trackedAttributeKey]: previousValue,
      },
    },
  };
}

describe("processJourneyDomainEvent", () => {
  let context: ServiceContext;

  beforeEach(async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Journey Planner Org",
    });

    context = {
      orgId: org.id,
      userId: user.id,
    };
  });

  test("marks journey as errored and does not create runs when tracked attribute key no longer exists", async () => {
    const definition = await clientCustomAttributeService.createDefinition(
      {
        fieldKey: "membershipTier",
        label: "Membership Tier",
        type: "TEXT",
        required: false,
        displayOrder: 0,
      },
      context,
    );

    const created = await journeyService.create(
      {
        name: "Client Updated Guard Journey",
        graph: createClientUpdatedJourneyGraph({
          trackedAttributeKey: "membershipTier",
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    await clientCustomAttributeService.deleteDefinition(definition.id, context);

    const result = await processJourneyDomainEvent(
      {
        id: "evt-client-updated-missing-attr",
        orgId: context.orgId,
        type: "client.updated",
        payload: createClientUpdatedPayload({
          trackedAttributeKey: "membershipTier",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": mock(async () => ({ eventId: "evt-scheduled-guard" })),
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    expect(result.plannedRunIds).toHaveLength(0);
    expect(result.scheduledDeliveryIds).toHaveLength(0);
    expect(result.erroredJourneyIds).toContain(created.id);

    await setTestOrgContext(db, context.orgId);

    const runs = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .where(eq(journeyRuns.triggerEntityType, "client"));
    expect(runs).toHaveLength(0);

    const definitions = await db
      .select({ id: clientCustomAttributeDefinitions.id })
      .from(clientCustomAttributeDefinitions)
      .where(eq(clientCustomAttributeDefinitions.fieldKey, "membershipTier"));
    expect(definitions).toHaveLength(0);
  });

  test("plans deterministic run and delivery for matching appointment event", async () => {
    const created = await journeyService.create(
      {
        name: "Planner Journey",
        graph: createJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-1",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T12:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [latestVersion] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .orderBy(desc(journeyVersions.version))
      .limit(1);

    const runs = await db
      .select()
      .from(journeyRuns)
      .where(eq(journeyRuns.journeyVersionId, latestVersion!.id));

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("planned");

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("planned");
    expect(deliveries[0]?.stepKey).toBe("send-node");
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
  });

  test("plans logger action deliveries with logger channel", async () => {
    const created = await journeyService.create(
      {
        name: "Logger Planner Journey",
        graph: createLoggerJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-logger-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: { logger: scheduleLoggerRequester },
        now: new Date("2026-02-16T10:10:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        channel: journeyDeliveries.channel,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("logger-node");
    expect(deliveries[0]?.channel).toBe("logger");
    expect(deliveries[0]?.status).toBe("planned");
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(1);
  });

  test("plans only scheduled branch deliveries on trigger fan-out", async () => {
    const created = await journeyService.create(
      {
        name: "Fan-out Planner Journey",
        graph: createFanoutJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-fanout-resend",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-fanout-logger",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-fanout-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        channel: journeyDeliveries.channel,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id))
      .orderBy(desc(journeyDeliveries.stepKey));

    // Only the scheduled branch (logger-node) is planned
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("logger-node");
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(1);
    // Canceled branch (send-node) is not planned on appointment.scheduled
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
  });

  test("hard-cuts integration actions to provider-specific schedulers", async () => {
    const [resendJourney, slackJourney] = await Promise.all([
      journeyService.create(
        {
          name: "Resend Scheduler Journey",
          graph: createJourneyGraph({ waitDuration: "5m" }),
        },
        context,
      ),
      journeyService.create(
        {
          name: "Slack Scheduler Journey",
          graph: createConditionJourneyGraph({
            expression: "false",
          }),
        },
        context,
      ),
    ]);

    await Promise.all([
      journeyService.publish(resendJourney.id, { mode: "live" }, context),
      journeyService.publish(slackJourney.id, { mode: "live" }, context),
    ]);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-resend",
    }));
    const scheduleSlackRequester = mock(async () => ({
      eventId: "evt-scheduled-slack",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-provider-scheduler-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
          "send-slack": scheduleSlackRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T10:05:00.000Z"),
      },
    );

    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(scheduleSlackRequester).toHaveBeenCalledTimes(1);
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(0);
  });

  test("routes send-resend-template through the resend-specific scheduler", async () => {
    const created = await journeyService.create(
      {
        name: "Resend Template Scheduler Journey",
        graph: createResendTemplateJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-resend-template",
    }));
    const scheduleSlackRequester = mock(async () => ({
      eventId: "evt-scheduled-slack-template",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger-template",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-resend-template-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
          "send-slack": scheduleSlackRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T10:15:00.000Z"),
      },
    );

    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(scheduleSlackRequester).toHaveBeenCalledTimes(0);
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(0);
  });

  test("routes send-twilio through the twilio-specific scheduler", async () => {
    const created = await journeyService.create(
      {
        name: "Twilio Scheduler Journey",
        graph: createTwilioJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-resend-twilio",
    }));
    const scheduleSlackRequester = mock(async () => ({
      eventId: "evt-scheduled-slack-twilio",
    }));
    const scheduleTwilioRequester = mock(async () => ({
      eventId: "evt-scheduled-twilio",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger-twilio",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-twilio-route-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
          "send-slack": scheduleSlackRequester,
          "send-twilio": scheduleTwilioRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T10:05:00.000Z"),
      },
    );

    expect(scheduleTwilioRequester).toHaveBeenCalledTimes(1);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
    expect(scheduleSlackRequester).toHaveBeenCalledTimes(0);
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(0);
  });

  test("routes through the matching condition branch during planning", async () => {
    const created = await journeyService.create(
      {
        name: "Condition Branch Journey",
        graph: createConditionJourneyGraph({
          expression: 'appointment.timezone == "America/New_York"',
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-condition-branch",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-condition-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          timezone: "America/New_York",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        channel: journeyDeliveries.channel,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("send-true-node");
    expect(deliveries[0]?.channel).toBe("email");
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
  });

  test("does not schedule downstream deliveries when condition is false and false edge is missing", async () => {
    const created = await journeyService.create(
      {
        name: "Condition Missing Branch Journey",
        graph: createConditionJourneyGraph({
          expression: "false",
          includeFalseEdge: false,
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-condition-missing",
    }));

    const result = await processJourneyDomainEvent(
      {
        id: "evt-condition-2",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({
        id: journeyRuns.id,
        status: journeyRuns.status,
        completedAt: journeyRuns.completedAt,
      })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(result.erroredJourneyIds).toHaveLength(0);
    expect(run?.status).toBe("completed");
    expect(run?.completedAt).toBeDefined();
    expect(deliveries).toHaveLength(0);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
  });

  test("cancels pending deliveries when reschedule no longer matches filter", async () => {
    const created = await journeyService.create(
      {
        name: "Filtered Planner Journey",
        graph: createJourneyGraph({
          waitDuration: "1h",
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.timezone",
                    operator: "equals",
                    value: "America/New_York",
                  },
                ],
              },
            ],
          },
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await processJourneyDomainEvent(
      {
        id: "evt-2",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          timezone: "America/New_York",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    const cancelRequester = mock(async () => ({ eventId: "evt-canceled-1" }));

    await processJourneyDomainEvent(
      {
        id: "evt-3",
        orgId: context.orgId,
        type: "appointment.rescheduled",
        payload: createAppointmentPayload({
          appointmentId,
          timezone: "UTC",
          previousTimezone: "America/New_York",
        }),
        timestamp: "2026-02-16T10:30:00.000Z",
      },
      {
        cancelRequester,
        now: new Date("2026-02-16T09:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select().from(journeyRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("canceled");

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("canceled");
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("keeps run and delivery identities idempotent for duplicate events", async () => {
    const created = await journeyService.create(
      {
        name: "Idempotent Journey",
        graph: createJourneyGraph({ waitDuration: "90m" }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const payload = createAppointmentPayload({ appointmentId });

    await processJourneyDomainEvent({
      id: "evt-4",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload,
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    await processJourneyDomainEvent({
      id: "evt-4-duplicate",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload,
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select().from(journeyRuns);
    expect(runs).toHaveLength(1);

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
  });

  test("creates independent run and delivery sets when two journeys match the same appointment", async () => {
    const [firstJourney, secondJourney] = await Promise.all([
      journeyService.create(
        {
          name: "Multi Journey A",
          graph: createJourneyGraph({ waitDuration: "30m" }),
        },
        context,
      ),
      journeyService.create(
        {
          name: "Multi Journey B",
          graph: createJourneyGraph({ waitDuration: "30m" }),
        },
        context,
      ),
    ]);

    await Promise.all([
      journeyService.publish(firstJourney.id, { mode: "live" }, context),
      journeyService.publish(secondJourney.id, { mode: "live" }, context),
    ]);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-multi-journey",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-multi-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:30:00.000Z"),
      },
    );

    await processJourneyDomainEvent(
      {
        id: "evt-multi-1-duplicate",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select({ id: journeyRuns.id }).from(journeyRuns);
    expect(runs).toHaveLength(2);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        deterministicKey: journeyDeliveries.deterministicKey,
      })
      .from(journeyDeliveries)
      .orderBy(desc(journeyDeliveries.id));

    expect(deliveries).toHaveLength(2);
    expect(
      new Set(deliveries.map((delivery) => delivery.deterministicKey)).size,
    ).toBe(2);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(2);
  });

  test("treats due-now deliveries as planned instead of past_due", async () => {
    const created = await journeyService.create(
      {
        name: "Due Now Journey",
        graph: createJourneyGraph({
          waitUntil: "2026-02-16T09:00:00.000Z",
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-due-now",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-due-now-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T09:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .limit(1);

    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id))
      .limit(1);

    expect(delivery?.status).toBe("planned");
    expect(delivery?.reasonCode).toBeNull();
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
  });

  test("plans immediate action deliveries even when scheduled timestamp is in the past", async () => {
    const created = await journeyService.create(
      {
        name: "Past Due Journey",
        graph: createJourneyGraph({
          waitUntil: "2020-01-01T00:00:00.000Z",
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-2",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-5",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select().from(journeyRuns);
    expect(runs).toHaveLength(1);

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("planned");
    expect(deliveries[0]?.reasonCode).toBeNull();
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
  });

  test("creates mode=test runs for published journeys in test mode", async () => {
    const created = await journeyService.create(
      {
        name: "Test Only Planner Journey",
        graph: createJourneyGraph({ waitDuration: "15m" }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "test",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await processJourneyDomainEvent({
      id: "evt-test-mode-1",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload: createAppointmentPayload({ appointmentId }),
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id, mode: journeyRuns.mode })
      .from(journeyRuns)
      .limit(1);

    expect(run).toBeDefined();
    expect(run?.mode).toBe("test");
  });

  test("creates wait-resume delivery when wait is in the future", async () => {
    const created = await journeyService.create(
      {
        name: "Wait Resume Journey",
        graph: createJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-wait-resume-1",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-wr",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-wr-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        channel: journeyDeliveries.channel,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("wait-node");
    expect(deliveries[0]?.actionType).toBe("wait-resume");
    expect(deliveries[0]?.channel).toBe("internal");
    expect(deliveries[0]?.status).toBe("planned");
    expect(deliveries[0]?.scheduledFor.toISOString()).toBe(
      "2026-02-16T12:00:00.000Z",
    );
    expect(scheduleWaitResumeRequester).toHaveBeenCalledTimes(1);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
  });

  test("does not create wait-resume when wait has already elapsed", async () => {
    const created = await journeyService.create(
      {
        name: "Elapsed Wait Journey",
        graph: createJourneyGraph({ waitDuration: "30m" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-wait-resume-elapsed",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-elapsed",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-elapsed-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("send-node");
    expect(deliveries[0]?.actionType).toBe("send-resend");
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(scheduleWaitResumeRequester).toHaveBeenCalledTimes(0);
  });

  test("treats wait-for-confirmation as a no-op when confirmation is not required", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation No-op Journey",
        graph: createWaitForConfirmationJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleTimeoutRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-noop",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-wfc-send-noop",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-wfc-noop-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: false,
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.actionType).toBe("send-resend");
    expect(deliveries[0]?.status).toBe("planned");
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(scheduleTimeoutRequester).toHaveBeenCalledTimes(0);
  });

  test("schedules wait-for-confirmation timeout when confirmation is required", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation Required Journey",
        graph: createWaitForConfirmationJourneyGraph({
          confirmationGraceMinutes: 15,
        }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleTimeoutRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-required",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-wfc-send-required",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-wfc-required-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.actionType).toBe("wait-for-confirmation-timeout");
    expect(deliveries[0]?.status).toBe("planned");
    expect(deliveries[0]?.scheduledFor.toISOString()).toBe(
      "2026-03-10T14:15:00.000Z",
    );
    expect(scheduleTimeoutRequester).toHaveBeenCalledTimes(1);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
  });

  test("resumes run on appointment.confirmed by canceling timeout and planning next step", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation Resume Journey",
        graph: createWaitForConfirmationJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleTimeoutRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-resume",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-wfc-send-resume",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-wfc-resume-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const [timeoutDelivery] = await db
      .select({
        id: journeyDeliveries.id,
        stepKey: journeyDeliveries.stepKey,
      })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.journeyRunId, run!.id),
          eq(journeyDeliveries.actionType, "wait-for-confirmation-timeout"),
          eq(journeyDeliveries.status, "planned"),
        ),
      )
      .limit(1);

    expect(timeoutDelivery).toBeDefined();

    const [appointment] = await db
      .select({ calendarId: appointments.calendarId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(appointment).toBeDefined();

    await db
      .update(calendars)
      .set({ requiresConfirmation: true })
      .where(eq(calendars.id, appointment!.calendarId));
    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, appointmentId));

    const cancelRequester = mock(async () => ({
      eventId: "evt-wfc-cancel-resume",
    }));

    const confirmedResult = await processJourneyDomainEvent(
      {
        id: "evt-wfc-resume-2",
        orgId: context.orgId,
        type: "appointment.confirmed",
        payload: createAppointmentPayload({
          appointmentId,
          status: "confirmed",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-03-10T13:30:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        cancelRequester,
        now: new Date("2026-03-10T13:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    const canceledTimeout = deliveries.find(
      (delivery) => delivery.actionType === "wait-for-confirmation-timeout",
    );
    const resumedSend = deliveries.find(
      (delivery) => delivery.actionType === "send-resend",
    );

    expect(canceledTimeout).toBeDefined();
    expect(canceledTimeout?.status).toBe("canceled");
    expect(canceledTimeout?.reasonCode).toBe("appointment_confirmed");
    expect(resumedSend).toBeDefined();
    expect(resumedSend?.status).toBe("planned");
    expect(confirmedResult.canceledDeliveryIds).toContain(timeoutDelivery!.id);
    expect(confirmedResult.scheduledDeliveryIds).toContain(resumedSend!.id);
    expect(scheduleTimeoutRequester).toHaveBeenCalledTimes(1);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("resumes run on appointment.confirmed after journey version changes", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation Resume Across Versions",
        graph: createWaitForConfirmationJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleTimeoutRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-resume-versioned",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-wfc-send-resume-versioned",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-wfc-resume-versioned-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({
        id: journeyRuns.id,
        journeyVersionId: journeyRuns.journeyVersionId,
      })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const [timeoutDelivery] = await db
      .select({
        id: journeyDeliveries.id,
        stepKey: journeyDeliveries.stepKey,
      })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.journeyRunId, run!.id),
          eq(journeyDeliveries.actionType, "wait-for-confirmation-timeout"),
          eq(journeyDeliveries.status, "planned"),
        ),
      )
      .limit(1);

    expect(timeoutDelivery).toBeDefined();

    const [appointment] = await db
      .select({ calendarId: appointments.calendarId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(appointment).toBeDefined();

    await db
      .update(calendars)
      .set({ requiresConfirmation: true })
      .where(eq(calendars.id, appointment!.calendarId));
    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, appointmentId));

    await journeyService.update(
      created.id,
      {
        graph: createWaitForConfirmationJourneyGraph({
          confirmationGraceMinutes: 5,
        }),
      },
      context,
    );

    const cancelRequester = mock(async () => ({
      eventId: "evt-wfc-cancel-resume-versioned",
    }));

    const confirmedResult = await processJourneyDomainEvent(
      {
        id: "evt-wfc-resume-versioned-2",
        orgId: context.orgId,
        type: "appointment.confirmed",
        payload: createAppointmentPayload({
          appointmentId,
          status: "confirmed",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-03-10T13:30:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        cancelRequester,
        now: new Date("2026-03-10T13:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    const canceledTimeout = deliveries.find(
      (delivery) => delivery.actionType === "wait-for-confirmation-timeout",
    );
    const resumedSend = deliveries.find(
      (delivery) => delivery.actionType === "send-resend",
    );

    expect(run?.journeyVersionId).toBeDefined();
    expect(canceledTimeout?.status).toBe("canceled");
    expect(canceledTimeout?.reasonCode).toBe("appointment_confirmed");
    expect(resumedSend?.status).toBe("planned");
    expect(confirmedResult.canceledDeliveryIds).toContain(timeoutDelivery!.id);
    expect(confirmedResult.scheduledDeliveryIds).toContain(resumedSend!.id);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("resumes the earliest timeout run when multiple versioned runs are active", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation Earliest Timeout Resume",
        graph: createWaitForConfirmationJourneyGraph({
          confirmationGraceMinutes: 30,
        }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await setTestOrgContext(db, context.orgId);
    const [appointment] = await db
      .select({ calendarId: appointments.calendarId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(appointment).toBeDefined();

    await db
      .update(calendars)
      .set({ requiresConfirmation: true })
      .where(eq(calendars.id, appointment!.calendarId));

    const scheduleTimeoutRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-earliest",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-wfc-send-earliest",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-wfc-earliest-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await journeyService.update(
      created.id,
      {
        graph: createWaitForConfirmationJourneyGraph({
          confirmationGraceMinutes: 5,
        }),
      },
      context,
    );

    await processJourneyDomainEvent(
      {
        id: "evt-wfc-earliest-2",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-02-16T10:05:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:05:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db
      .select({
        id: journeyRuns.id,
        journeyVersionId: journeyRuns.journeyVersionId,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.triggerEntityId, appointmentId));

    expect(runs).toHaveLength(2);

    const timeoutDeliveriesBeforeConfirm = await db
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.actionType, "wait-for-confirmation-timeout"),
          eq(journeyDeliveries.status, "planned"),
        ),
      );

    expect(timeoutDeliveriesBeforeConfirm).toHaveLength(2);

    const sortedTimeouts = [...timeoutDeliveriesBeforeConfirm].sort((a, b) => {
      const byTime = a.scheduledFor.getTime() - b.scheduledFor.getTime();
      if (byTime !== 0) {
        return byTime;
      }
      return a.id.localeCompare(b.id);
    });
    const earliestTimeout = sortedTimeouts[0]!;
    const laterTimeout = sortedTimeouts[1]!;

    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, appointmentId));

    const cancelRequester = mock(async () => ({
      eventId: "evt-wfc-cancel-earliest",
    }));

    const confirmedResult = await processJourneyDomainEvent(
      {
        id: "evt-wfc-earliest-3",
        orgId: context.orgId,
        type: "appointment.confirmed",
        payload: createAppointmentPayload({
          appointmentId,
          status: "confirmed",
          calendarRequiresConfirmation: true,
        }),
        timestamp: "2026-03-10T13:30:00.000Z",
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        cancelRequester,
        now: new Date("2026-03-10T13:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const timeoutDeliveriesAfterConfirm = await db
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.actionType, "wait-for-confirmation-timeout"));

    const earliestTimeoutAfterConfirm = timeoutDeliveriesAfterConfirm.find(
      (delivery) => delivery.id === earliestTimeout.id,
    );
    const laterTimeoutAfterConfirm = timeoutDeliveriesAfterConfirm.find(
      (delivery) => delivery.id === laterTimeout.id,
    );
    const resumedSendDeliveries = await db
      .select({
        journeyRunId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.actionType, "send-resend"));

    expect(earliestTimeoutAfterConfirm?.status).toBe("canceled");
    expect(earliestTimeoutAfterConfirm?.reasonCode).toBe(
      "appointment_confirmed",
    );
    expect(laterTimeoutAfterConfirm?.status).toBe("planned");
    expect(confirmedResult.canceledDeliveryIds).toContain(earliestTimeout.id);
    expect(confirmedResult.canceledDeliveryIds).not.toContain(laterTimeout.id);
    expect(
      resumedSendDeliveries.some(
        (delivery) =>
          delivery.journeyRunId === earliestTimeout.journeyRunId &&
          delivery.status === "planned",
      ),
    ).toBe(true);
    expect(
      resumedSendDeliveries.some(
        (delivery) => delivery.journeyRunId === laterTimeout.journeyRunId,
      ),
    ).toBe(false);
    expect(scheduleTimeoutRequester).toHaveBeenCalledTimes(2);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("sequential waits produce one wait-resume at a time", async () => {
    const graph: LinearJourneyGraph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger-node",
          attributes: {
            id: "trigger-node",
            type: "trigger-node",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "wait-1",
          attributes: {
            id: "wait-1",
            type: "action-node",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Wait 1",
              config: { actionType: "wait", waitDuration: "1h" },
            },
          },
        },
        {
          key: "wait-2",
          attributes: {
            id: "wait-2",
            type: "action-node",
            position: { x: 0, y: 240 },
            data: {
              type: "action",
              label: "Wait 2",
              config: { actionType: "wait", waitDuration: "2h" },
            },
          },
        },
        {
          key: "send-node",
          attributes: {
            id: "send-node",
            type: "action-node",
            position: { x: 0, y: 360 },
            data: {
              type: "action",
              label: "Send",
              config: { actionType: "send-resend" },
            },
          },
        },
      ],
      edges: [
        {
          key: "trigger-to-wait-1",
          source: "trigger-node",
          target: "wait-1",
          attributes: {
            id: "trigger-to-wait-1",
            source: "trigger-node",
            target: "wait-1",
          },
        },
        {
          key: "wait-1-to-wait-2",
          source: "wait-1",
          target: "wait-2",
          attributes: {
            id: "wait-1-to-wait-2",
            source: "wait-1",
            target: "wait-2",
          },
        },
        {
          key: "wait-2-to-send",
          source: "wait-2",
          target: "send-node",
          attributes: {
            id: "wait-2-to-send",
            source: "wait-2",
            target: "send-node",
          },
        },
      ],
    };

    const created = await journeyService.create(
      { name: "Sequential Waits", graph },
      context,
    );
    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-seq-wait",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-seq-resend",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-seq-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    // Only one wait-resume at the first wait boundary
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("wait-1");
    expect(deliveries[0]?.actionType).toBe("wait-resume");
    expect(deliveries[0]?.scheduledFor.toISOString()).toBe(
      "2026-02-16T11:00:00.000Z",
    );
    expect(scheduleWaitResumeRequester).toHaveBeenCalledTimes(1);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
  });

  test("cancellation cancels pending wait-resume deliveries", async () => {
    const created = await journeyService.create(
      {
        name: "Cancel Wait Resume Journey",
        graph: createJourneyGraph({ waitDuration: "3h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-wr-cancel-schedule",
    }));

    // Schedule — creates a wait-resume delivery
    await processJourneyDomainEvent(
      {
        id: "evt-cancel-wr-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: { "wait-resume": scheduleWaitResumeRequester },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    const cancelRequester = mock(async () => ({
      eventId: "evt-wr-cancel",
    }));

    // Cancel via stop trigger
    await processJourneyDomainEvent(
      {
        id: "evt-cancel-wr-2",
        orgId: context.orgId,
        type: "appointment.canceled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T11:00:00.000Z",
      },
      {
        cancelRequester,
        now: new Date("2026-02-16T11:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id, status: journeyRuns.status })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    expect(run?.status).toBe("canceled");

    const deliveries = await db
      .select({
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.actionType).toBe("wait-resume");
    expect(deliveries[0]?.status).toBe("canceled");
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("keeps test-mode wait scheduling identical to live mode", async () => {
    const liveJourney = await journeyService.create(
      {
        name: "Wait Invariance Live Journey",
        graph: createJourneyGraph({ waitDuration: "45m" }),
      },
      context,
    );

    await journeyService.publish(
      liveJourney.id,
      {
        mode: "live",
      },
      context,
    );

    const testOnlyJourney = await journeyService.create(
      {
        name: "Wait Invariance Test Journey",
        graph: createJourneyGraph({ waitDuration: "45m" }),
      },
      context,
    );

    await journeyService.publish(
      testOnlyJourney.id,
      {
        mode: "test",
      },
      context,
    );

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-test-wait-invariance",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-test-wait-invariance",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db
      .select({ id: journeyRuns.id, mode: journeyRuns.mode })
      .from(journeyRuns);

    const runByMode = new Map(runs.map((run) => [run.mode, run.id]));
    expect(runByMode.size).toBe(2);

    const [liveDelivery] = await db
      .select({ scheduledFor: journeyDeliveries.scheduledFor })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runByMode.get("live")!))
      .limit(1);

    const [testDelivery] = await db
      .select({ scheduledFor: journeyDeliveries.scheduledFor })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runByMode.get("test")!))
      .limit(1);

    expect(liveDelivery).toBeDefined();
    expect(testDelivery).toBeDefined();
    expect(testDelivery?.scheduledFor.toISOString()).toBe(
      liveDelivery?.scheduledFor.toISOString(),
    );
  });
  test("plans only scheduled branch on appointment.scheduled with branched graph", async () => {
    const created = await journeyService.create(
      {
        name: "Trigger Branch Scheduled Journey",
        graph: createTriggerBranchJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-branch-wr",
    }));
    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-branch-resend",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-branch-logger",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-branch-scheduled-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          "send-resend": scheduleResendRequester,
          "send-resend-template": scheduleResendRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    // Should only plan the scheduled branch (wait-node -> send-node)
    // Wait is in the future, so we get a wait-resume delivery
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("wait-node");
    expect(deliveries[0]?.actionType).toBe("wait-resume");
    // Cancel-branch logger should NOT be scheduled
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(0);
    expect(scheduleWaitResumeRequester).toHaveBeenCalledTimes(1);
  });

  test("cancels scheduled deliveries AND plans cancel-branch on appointment.canceled", async () => {
    const created = await journeyService.create(
      {
        name: "Trigger Branch Cancel Journey",
        graph: createTriggerBranchJourneyGraph({ waitDuration: "3h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-branch-cancel-wr",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-branch-cancel-logger",
    }));

    // Schedule first — creates wait-resume on scheduled branch
    await processJourneyDomainEvent(
      {
        id: "evt-branch-cancel-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    const cancelRequester = mock(async () => ({
      eventId: "evt-branch-cancel-req",
    }));

    // Cancel — should cancel scheduled-path deliveries AND plan cancel-branch
    await processJourneyDomainEvent(
      {
        id: "evt-branch-cancel-2",
        orgId: context.orgId,
        type: "appointment.canceled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T11:00:00.000Z",
      },
      {
        cancelRequester,
        providerRequesters: {
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T11:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id, status: journeyRuns.status })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    // Wait-resume should be canceled
    const waitResumeDelivery = deliveries.find(
      (d) => d.actionType === "wait-resume",
    );
    expect(waitResumeDelivery?.status).toBe("canceled");

    // Cancel-branch logger should be planned
    const loggerDelivery = deliveries.find(
      (d) => d.stepKey === "cancel-logger-node",
    );
    expect(loggerDelivery).toBeDefined();
    expect(loggerDelivery?.status).toBe("planned");

    // Logger requester should be called for the cancel-branch delivery
    expect(scheduleLoggerRequester).toHaveBeenCalled();
    // Cancel requester should be called for the wait-resume cancellation
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("cancel with no cancel-branch wired preserves existing behavior", async () => {
    // Use a graph WITHOUT trigger branch labels (backwards compat)
    const created = await journeyService.create(
      {
        name: "No Cancel Branch Journey",
        graph: createJourneyGraph({ waitDuration: "3h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-no-cancel-branch-wr",
    }));

    // Schedule first
    await processJourneyDomainEvent(
      {
        id: "evt-no-cancel-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    const cancelRequester = mock(async () => ({
      eventId: "evt-no-cancel-branch-cancel",
    }));

    // Cancel — no cancel branch, just cancels existing deliveries
    await processJourneyDomainEvent(
      {
        id: "evt-no-cancel-2",
        orgId: context.orgId,
        type: "appointment.canceled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T11:00:00.000Z",
      },
      {
        cancelRequester,
        now: new Date("2026-02-16T11:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id, status: journeyRuns.status })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    expect(run?.status).toBe("canceled");

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    // Only the wait-resume, which is canceled
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.actionType).toBe("wait-resume");
    expect(deliveries[0]?.status).toBe("canceled");
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("cancel-path deliveries use same run", async () => {
    const created = await journeyService.create(
      {
        name: "Same Run Cancel Path Journey",
        graph: createTriggerBranchJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-same-run-wr",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-same-run-logger",
    }));

    // Schedule
    await processJourneyDomainEvent(
      {
        id: "evt-same-run-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runsBefore = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns);
    expect(runsBefore).toHaveLength(1);
    const runId = runsBefore[0]!.id;

    // Cancel
    await processJourneyDomainEvent(
      {
        id: "evt-same-run-2",
        orgId: context.orgId,
        type: "appointment.canceled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T11:00:00.000Z",
      },
      {
        providerRequesters: {
          logger: scheduleLoggerRequester,
        },
        now: new Date("2026-02-16T11:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runsAfter = await db.select({ id: journeyRuns.id }).from(journeyRuns);
    // Same run — no new run created
    expect(runsAfter).toHaveLength(1);
    expect(runsAfter[0]!.id).toBe(runId);

    // Cancel-branch delivery on the same run
    const deliveries = await db
      .select({
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    const cancelBranchDelivery = deliveries.find(
      (d) => d.stepKey === "cancel-logger-node",
    );
    expect(cancelBranchDelivery).toBeDefined();
    expect(cancelBranchDelivery?.journeyRunId).toBe(runId);
  });
});

describe("executeWaitResume", () => {
  let context: ServiceContext;

  beforeEach(async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Wait Resume Org",
    });

    context = {
      orgId: org.id,
      userId: user.id,
    };
  });

  async function triggerAndGetWaitResumeDelivery(input: {
    journeyId: string;
    appointmentId: string;
    now: Date;
  }) {
    const scheduleWaitResumeRequester = mock(async () => ({
      eventId: "evt-wr-setup",
    }));

    await processJourneyDomainEvent(
      {
        id: `evt-wr-setup-${Date.now()}`,
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: input.appointmentId,
        }),
        timestamp: input.now.toISOString(),
      },
      {
        providerRequesters: {
          "wait-resume": scheduleWaitResumeRequester,
          "send-resend": mock(async () => ({ eventId: "evt-wr-resend" })),
          "send-resend-template": mock(async () => ({
            eventId: "evt-wr-template",
          })),
          "send-slack": mock(async () => ({ eventId: "evt-wr-slack" })),
        },
        now: input.now,
        journeyIds: [input.journeyId],
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const [delivery] = await db
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
      })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.journeyRunId, run!.id),
          eq(journeyDeliveries.actionType, "wait-resume"),
        ),
      )
      .limit(1);

    return { runId: run!.id, delivery: delivery! };
  }

  test("schedules post-wait deliveries on resume", async () => {
    const created = await journeyService.create(
      {
        name: "Wait Resume Planner Journey",
        graph: createJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const now = new Date("2026-02-16T10:00:00.000Z");

    const { runId, delivery } = await triggerAndGetWaitResumeDelivery({
      journeyId: created.id,
      appointmentId,
      now,
    });

    const result = await executeWaitResume({
      orgId: context.orgId,
      journeyRunId: runId,
      journeyDeliveryId: delivery.id,
      stepKey: delivery.stepKey,
    });

    expect(result.scheduledDeliveryIds).toHaveLength(1);

    await setTestOrgContext(db, context.orgId);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    const waitResumeDelivery = deliveries.find(
      (d) => d.actionType === "wait-resume",
    );
    expect(waitResumeDelivery?.status).toBe("sent");

    const sendDelivery = deliveries.find((d) => d.actionType === "send-resend");
    expect(sendDelivery).toBeDefined();
    expect(sendDelivery?.status).toBe("planned");
    expect(sendDelivery?.stepKey).toBe("send-node");
  });

  test("evaluates condition node with fresh context after resume", async () => {
    const created = await journeyService.create(
      {
        name: "Wait Condition Resume Journey",
        graph: createWaitConditionJourneyGraph({
          expression: 'appointment.status == "confirmed"',
          waitDuration: "1h",
        }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const now = new Date("2026-02-16T10:00:00.000Z");

    const { runId, delivery } = await triggerAndGetWaitResumeDelivery({
      journeyId: created.id,
      appointmentId,
      now,
    });

    // Update appointment status to "confirmed" so the condition evaluates true
    await setTestOrgContext(db, context.orgId);
    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, appointmentId));

    const result = await executeWaitResume({
      orgId: context.orgId,
      journeyRunId: runId,
      journeyDeliveryId: delivery.id,
      stepKey: delivery.stepKey,
    });

    expect(result.scheduledDeliveryIds.length).toBeGreaterThanOrEqual(1);

    await setTestOrgContext(db, context.orgId);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
        channel: journeyDeliveries.channel,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    const sendDeliveries = deliveries.filter(
      (d) => d.actionType !== "wait-resume",
    );
    expect(sendDeliveries).toHaveLength(1);
    expect(sendDeliveries[0]?.stepKey).toBe("send-true-node");
    expect(sendDeliveries[0]?.channel).toBe("email");
  });

  test("returns empty result when run is not found", async () => {
    const result = await executeWaitResume({
      orgId: context.orgId,
      journeyRunId: "019508a0-0000-7000-8000-000000000000",
      journeyDeliveryId: "019508a0-0000-7000-8000-000000000001",
      stepKey: "wait-node",
    });

    expect(result.scheduledDeliveryIds).toHaveLength(0);
    expect(result.canceledDeliveryIds).toHaveLength(0);
  });

  test("returns empty result when run is already completed", async () => {
    const created = await journeyService.create(
      {
        name: "Completed Run Journey",
        graph: createJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const now = new Date("2026-02-16T10:00:00.000Z");

    const { runId, delivery } = await triggerAndGetWaitResumeDelivery({
      journeyId: created.id,
      appointmentId,
      now,
    });

    // Manually mark run as completed
    await setTestOrgContext(db, context.orgId);
    await db
      .update(journeyRuns)
      .set({ status: "completed" })
      .where(eq(journeyRuns.id, runId));

    const result = await executeWaitResume({
      orgId: context.orgId,
      journeyRunId: runId,
      journeyDeliveryId: delivery.id,
      stepKey: delivery.stepKey,
    });

    expect(result.scheduledDeliveryIds).toHaveLength(0);
    expect(result.canceledDeliveryIds).toHaveLength(0);

    // Verify no new deliveries were created
    await setTestOrgContext(db, context.orgId);
    const deliveries = await db
      .select({ actionType: journeyDeliveries.actionType })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    const nonWaitResumeDeliveries = deliveries.filter(
      (d) => d.actionType !== "wait-resume",
    );
    expect(nonWaitResumeDeliveries).toHaveLength(0);
  });

  test("returns empty result when appointment is deleted", async () => {
    const created = await journeyService.create(
      {
        name: "Deleted Appointment Journey",
        graph: createJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const now = new Date("2026-02-16T10:00:00.000Z");

    const { runId, delivery } = await triggerAndGetWaitResumeDelivery({
      journeyId: created.id,
      appointmentId,
      now,
    });

    // Delete the appointment
    await setTestOrgContext(db, context.orgId);
    await db.delete(appointments).where(eq(appointments.id, appointmentId));

    const result = await executeWaitResume({
      orgId: context.orgId,
      journeyRunId: runId,
      journeyDeliveryId: delivery.id,
      stepKey: delivery.stepKey,
    });

    expect(result.scheduledDeliveryIds).toHaveLength(0);
    expect(result.canceledDeliveryIds).toHaveLength(0);
  });
});

describe("executeWaitForConfirmationTimeout", () => {
  let context: ServiceContext;

  beforeEach(async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Wait For Confirmation Timeout Org",
    });

    context = {
      orgId: org.id,
      userId: user.id,
    };
  });

  async function triggerAndGetWaitForConfirmationDelivery(input: {
    journeyId: string;
    appointmentId: string;
    now: Date;
  }) {
    const scheduleTimeoutRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-setup",
    }));

    await processJourneyDomainEvent(
      {
        id: `evt-wfc-timeout-setup-${Date.now()}`,
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: input.appointmentId,
          status: "scheduled",
          calendarRequiresConfirmation: true,
        }),
        timestamp: input.now.toISOString(),
      },
      {
        providerRequesters: {
          "wait-for-confirmation-timeout": scheduleTimeoutRequester,
          "send-resend": mock(async () => ({ eventId: "evt-wfc-send-setup" })),
          "send-resend-template": mock(async () => ({
            eventId: "evt-wfc-template-setup",
          })),
        },
        now: input.now,
        journeyIds: [input.journeyId],
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const [delivery] = await db
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
        actionType: journeyDeliveries.actionType,
      })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.journeyRunId, run!.id),
          eq(journeyDeliveries.actionType, "wait-for-confirmation-timeout"),
        ),
      )
      .limit(1);

    return { runId: run!.id, delivery: delivery! };
  }

  test("cancels the run when timeout fires and appointment remains unconfirmed", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation Timeout Cancel Journey",
        graph: createWaitForConfirmationJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await setTestOrgContext(db, context.orgId);
    const [appointment] = await db
      .select({ calendarId: appointments.calendarId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(appointment).toBeDefined();

    await db
      .update(calendars)
      .set({ requiresConfirmation: true })
      .where(eq(calendars.id, appointment!.calendarId));

    const { runId, delivery } = await triggerAndGetWaitForConfirmationDelivery({
      journeyId: created.id,
      appointmentId,
      now: new Date("2026-02-16T10:00:00.000Z"),
    });

    const cancelRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-cancel",
    }));

    const result = await executeWaitForConfirmationTimeout(
      {
        orgId: context.orgId,
        journeyRunId: runId,
        journeyDeliveryId: delivery.id,
        stepKey: delivery.stepKey,
      },
      {
        cancelRequester,
        now: new Date("2026-03-10T14:00:00.000Z"),
      },
    );

    expect(result.scheduledDeliveryIds).toHaveLength(0);

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, runId))
      .limit(1);

    const deliveries = await db
      .select({
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    const timeoutDelivery = deliveries.find(
      (entry) => entry.actionType === "wait-for-confirmation-timeout",
    );
    const sendDelivery = deliveries.find(
      (entry) => entry.actionType === "send-resend",
    );

    expect(run?.status).toBe("canceled");
    expect(timeoutDelivery?.status).toBe("sent");
    expect(sendDelivery).toBeUndefined();
    expect(cancelRequester).toHaveBeenCalledTimes(0);
  });

  test("continues the run when timeout fires after appointment is already confirmed", async () => {
    const created = await journeyService.create(
      {
        name: "Wait For Confirmation Timeout Continue Journey",
        graph: createWaitForConfirmationJourneyGraph(),
      },
      context,
    );

    await journeyService.publish(created.id, { mode: "live" }, context);

    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await setTestOrgContext(db, context.orgId);
    const [appointment] = await db
      .select({ calendarId: appointments.calendarId })
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    expect(appointment).toBeDefined();

    await db
      .update(calendars)
      .set({ requiresConfirmation: true })
      .where(eq(calendars.id, appointment!.calendarId));

    const { runId, delivery } = await triggerAndGetWaitForConfirmationDelivery({
      journeyId: created.id,
      appointmentId,
      now: new Date("2026-02-16T10:00:00.000Z"),
    });

    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, appointmentId));

    const scheduleRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-continue",
    }));
    const cancelRequester = mock(async () => ({
      eventId: "evt-wfc-timeout-continue-cancel",
    }));

    const result = await executeWaitForConfirmationTimeout(
      {
        orgId: context.orgId,
        journeyRunId: runId,
        journeyDeliveryId: delivery.id,
        stepKey: delivery.stepKey,
      },
      {
        scheduleRequester,
        cancelRequester,
        now: new Date("2026-03-10T14:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, runId))
      .limit(1);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        actionType: journeyDeliveries.actionType,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    const timeoutDelivery = deliveries.find(
      (entry) => entry.actionType === "wait-for-confirmation-timeout",
    );
    const sendDelivery = deliveries.find(
      (entry) => entry.actionType === "send-resend",
    );

    expect(run?.status).not.toBe("canceled");
    expect(timeoutDelivery?.status).toBe("sent");
    expect(sendDelivery?.status).toBe("planned");
    expect(result.scheduledDeliveryIds).toContain(sendDelivery!.id);
    expect(scheduleRequester).toHaveBeenCalledTimes(1);
    expect(cancelRequester).toHaveBeenCalledTimes(0);
  });
});
