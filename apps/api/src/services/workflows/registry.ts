import {
  domainEventDomains,
  domainEventTypesByDomain,
  type AppIntegrationKey,
  type DomainEventDomain,
  type DomainEventType,
  type WorkflowActionConfigField,
  type WorkflowOutputField,
} from "@scheduling/dto";
import { z } from "zod";

export type WorkflowTriggerDefinition =
  | {
      type: "domain_event";
      domain: DomainEventDomain;
      events: readonly DomainEventType[];
      defaultStartEvents: readonly DomainEventType[];
      defaultRestartEvents: readonly DomainEventType[];
      defaultStopEvents: readonly DomainEventType[];
    }
  | {
      type: "schedule";
      label: string;
      defaultTimezone: string;
    };

type WorkflowActionExecutionContext = {
  orgId: string;
  entityType: string;
  entityId: string;
  sourceEventType: DomainEventType | "schedule.triggered" | "manual.triggered";
  sourceEventPayload: Record<string, unknown>;
  entity: Record<string, unknown>;
};

export type WorkflowActionExecutionResult =
  | {
      status: "ok";
      channel: string;
      target: string | null;
      providerMessageId?: string | null;
      output: Record<string, unknown>;
    }
  | {
      status: "invalid_action";
      message: string;
    };

export type WorkflowActionIntegrationRequirement = {
  key: AppIntegrationKey;
  mode: "enabled_and_configured";
};

export type WorkflowActionDefinition = {
  id: string;
  label: string;
  description: string;
  category: string;
  requiresIntegration?: WorkflowActionIntegrationRequirement;
  configFields: WorkflowActionConfigField[];
  outputFields: WorkflowOutputField[];
  inputSchema: z.ZodType<Record<string, unknown>>;
  execute(input: {
    actionId: string;
    parsedInput: Record<string, unknown>;
    context: WorkflowActionExecutionContext;
  }): Promise<{
    channel: string;
    target: string | null;
    providerMessageId?: string | null;
    output?: Record<string, unknown>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTerminalEventType(eventType: DomainEventType): boolean {
  return (
    eventType.endsWith(".cancelled") ||
    eventType.endsWith(".deleted") ||
    eventType.endsWith(".no_show")
  );
}

const workflowTriggerRegistry: readonly WorkflowTriggerDefinition[] = [
  ...domainEventDomains.map((domain) => {
    const events = domainEventTypesByDomain[domain];
    return {
      type: "domain_event" as const,
      domain,
      events,
      defaultStartEvents: events.filter(
        (eventType) =>
          !isTerminalEventType(eventType) && !eventType.endsWith(".updated"),
      ),
      defaultRestartEvents: events.filter(
        (eventType) =>
          eventType.endsWith(".updated") || eventType.endsWith(".rescheduled"),
      ),
      defaultStopEvents: events.filter((eventType) =>
        isTerminalEventType(eventType),
      ),
    };
  }),
  {
    type: "schedule",
    label: "Schedule",
    defaultTimezone: "America/New_York",
  },
];

const workflowActionRegistry = [
  {
    id: "core.emitInternalEvent",
    label: "Emit Internal Event",
    description:
      "Emit a structured internal workflow event intent for downstream processing",
    category: "Core",
    configFields: [
      {
        key: "eventType",
        label: "Event Type",
        type: "template-input" as const,
        placeholder: "workflow.intent.created",
        required: true,
      },
      {
        key: "payload",
        label: "Payload",
        type: "template-textarea" as const,
        placeholder: '{"key":"value"}',
        rows: 6,
      },
    ],
    outputFields: [
      { field: "channel", description: "Execution channel" },
      { field: "target", description: "Correlated entity target" },
      { field: "eventType", description: "Internal event type" },
      { field: "payload", description: "Internal event payload" },
    ],
    inputSchema: z
      .object({
        eventType: z.string().trim().min(1),
        payload: z.record(z.string(), z.unknown()).default({}),
      })
      .loose(),
    execute: async ({ parsedInput, context }) => {
      const rawEventType = parsedInput["eventType"];
      const eventType =
        typeof rawEventType === "string" ? rawEventType.trim() : "";
      const payloadValue = parsedInput["payload"];
      const payload = isRecord(payloadValue) ? payloadValue : {};
      const target = `${context.entityType}:${context.entityId}`;

      return {
        channel: "core.emitInternalEvent",
        target,
        providerMessageId: null,
        output: {
          channel: "core.emitInternalEvent",
          target,
          eventType,
          payload,
          intent: {
            orgId: context.orgId,
            entityType: context.entityType,
            entityId: context.entityId,
            sourceEventType: context.sourceEventType,
          },
        },
      };
    },
  },
  {
    id: "logger.logMessage",
    label: "Log Message",
    description: "Write a structured message to the integration logger",
    category: "Integrations",
    requiresIntegration: {
      key: "logger",
      mode: "enabled_and_configured",
    },
    configFields: [
      {
        key: "message",
        label: "Message",
        type: "template-textarea" as const,
        placeholder: "Appointment {{@trigger:appointmentId}} was updated",
        rows: 4,
        required: true,
      },
      {
        key: "level",
        label: "Level",
        type: "select" as const,
        options: [
          { value: "info", label: "Info" },
          { value: "warning", label: "Warning" },
          { value: "error", label: "Error" },
        ],
      },
    ],
    outputFields: [
      { field: "channel", description: "Execution channel" },
      { field: "target", description: "Correlated entity target" },
      { field: "level", description: "Message severity level" },
      { field: "message", description: "Logged message" },
    ],
    inputSchema: z
      .object({
        message: z.string().trim().min(1),
        level: z.enum(["info", "warning", "error"]).default("info"),
      })
      .loose(),
    execute: async ({ parsedInput, context }) => {
      const rawMessage = parsedInput["message"];
      const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
      const rawLevel = parsedInput["level"];
      const level =
        rawLevel === "warning" || rawLevel === "error" ? rawLevel : "info";
      const target = `${context.entityType}:${context.entityId}`;

      return {
        channel: "logger.logMessage",
        target,
        providerMessageId: null,
        output: {
          channel: "logger.logMessage",
          target,
          level,
          message,
        },
      };
    },
  },
] satisfies readonly WorkflowActionDefinition[];

const workflowActionById = new Map<string, WorkflowActionDefinition>(
  workflowActionRegistry.map((definition) => [definition.id, definition]),
);

export function listWorkflowTriggerDefinitions(): readonly WorkflowTriggerDefinition[] {
  return workflowTriggerRegistry;
}

export function listWorkflowActionDefinitions(): readonly WorkflowActionDefinition[] {
  return workflowActionRegistry;
}

export function getWorkflowActionDefinition(
  actionId: string,
): WorkflowActionDefinition | null {
  return workflowActionById.get(actionId) ?? null;
}

export async function executeWorkflowAction(input: {
  actionId: string;
  rawInput: unknown;
  context: WorkflowActionExecutionContext;
}): Promise<WorkflowActionExecutionResult> {
  const definition = getWorkflowActionDefinition(input.actionId);
  if (!definition) {
    return {
      status: "invalid_action",
      message: `Unknown workflow action "${input.actionId}"`,
    };
  }

  const parsedInput = definition.inputSchema.safeParse(input.rawInput);
  if (!parsedInput.success) {
    const firstIssue = parsedInput.error.issues[0];
    return {
      status: "invalid_action",
      message: firstIssue
        ? `Invalid input for "${input.actionId}": ${firstIssue.message}`
        : `Invalid input for "${input.actionId}"`,
    };
  }

  const executed = await definition.execute({
    actionId: definition.id,
    parsedInput: parsedInput.data,
    context: input.context,
  });

  return {
    status: "ok",
    channel: executed.channel,
    target: executed.target,
    providerMessageId: executed.providerMessageId ?? null,
    output: executed.output ?? {
      channel: executed.channel,
      target: executed.target,
      providerMessageId: executed.providerMessageId ?? null,
    },
  };
}
