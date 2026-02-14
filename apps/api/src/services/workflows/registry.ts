import {
  domainEventDomains,
  domainEventTypesByDomain,
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

export type WorkflowActionDefinition = {
  id: string;
  integrationKey: string;
  label: string;
  description: string;
  category: string;
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
  }>;
};

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
    id: "resend.sendEmail",
    integrationKey: "resend",
    label: "Send Email",
    description: "Send an email via Resend",
    category: "Email",
    configFields: [
      {
        key: "to",
        label: "To",
        type: "template-input" as const,
        placeholder: "recipient@example.com",
        required: true,
      },
      {
        key: "subject",
        label: "Subject",
        type: "template-input" as const,
        placeholder: "Email subject",
        required: true,
      },
      {
        key: "body",
        label: "Body",
        type: "template-textarea" as const,
        placeholder: "Email body",
        rows: 5,
        required: true,
      },
      {
        key: "from",
        label: "From",
        type: "template-input" as const,
        placeholder: "sender@example.com (optional)",
      },
    ],
    outputFields: [
      { field: "channel", description: "Delivery channel" },
      { field: "target", description: "Recipient email address" },
      {
        field: "providerMessageId",
        description: "Provider message ID from Resend",
      },
    ],
    inputSchema: z
      .object({
        to: z.string().trim().min(1),
        subject: z.string().trim().min(1),
        body: z.string().trim().min(1),
        from: z.string().trim().optional(),
      })
      .loose(),
    execute: async ({ parsedInput }) => ({
      channel: "integration.resend.sendEmail",
      target: typeof parsedInput["to"] === "string" ? parsedInput["to"] : null,
      providerMessageId: null,
    }),
  },
  {
    id: "twilio.sendSms",
    integrationKey: "twilio",
    label: "Send SMS",
    description: "Send an SMS message via Twilio",
    category: "SMS",
    configFields: [
      {
        key: "to",
        label: "To",
        type: "template-input" as const,
        placeholder: "+1234567890",
        required: true,
      },
      {
        key: "body",
        label: "Body",
        type: "template-textarea" as const,
        placeholder: "SMS message body",
        required: true,
      },
    ],
    outputFields: [
      { field: "channel", description: "Delivery channel" },
      { field: "target", description: "Recipient phone number" },
      {
        field: "providerMessageId",
        description: "Provider message ID from Twilio",
      },
    ],
    inputSchema: z
      .object({
        to: z.string().trim().min(1),
        body: z.string().trim().min(1),
      })
      .loose(),
    execute: async ({ parsedInput }) => ({
      channel: "integration.twilio.sendSms",
      target: typeof parsedInput["to"] === "string" ? parsedInput["to"] : null,
      providerMessageId: null,
    }),
  },
  {
    id: "slack.sendMessage",
    integrationKey: "slack",
    label: "Send Slack Message",
    description: "Post a message to a Slack channel",
    category: "Chat",
    configFields: [
      {
        key: "channel",
        label: "Channel",
        type: "template-input" as const,
        placeholder: "#general",
        required: true,
      },
      {
        key: "text",
        label: "Message",
        type: "template-textarea" as const,
        placeholder: "Message text",
        required: true,
      },
    ],
    outputFields: [
      { field: "channel", description: "Delivery channel" },
      { field: "target", description: "Slack channel name" },
      {
        field: "providerMessageId",
        description: "Provider message ID from Slack",
      },
    ],
    inputSchema: z
      .object({
        channel: z.string().trim().min(1),
        text: z.string().trim().min(1),
      })
      .loose(),
    execute: async ({ parsedInput }) => ({
      channel: "integration.slack.sendMessage",
      target:
        typeof parsedInput["channel"] === "string"
          ? parsedInput["channel"]
          : null,
      providerMessageId: null,
    }),
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
  integrationKey: string | null;
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

  if (
    input.integrationKey !== null &&
    input.integrationKey !== definition.integrationKey
  ) {
    return {
      status: "invalid_action",
      message: `Action "${input.actionId}" requires integration "${definition.integrationKey}"`,
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
    output: {
      channel: executed.channel,
      target: executed.target,
      providerMessageId: executed.providerMessageId ?? null,
    },
  };
}
