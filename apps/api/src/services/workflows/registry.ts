import { webhookEventTypes, type WebhookEventType } from "@scheduling/dto";
import { z } from "zod";

export type WorkflowTriggerDefinition = {
  eventType: WebhookEventType;
  entityType: string;
  defaultReplacementMode:
    | "replace_active"
    | "cancel_without_replacement"
    | "allow_parallel";
};

type WorkflowActionExecutionContext = {
  orgId: string;
  entityType: string;
  entityId: string;
  sourceEventType: WebhookEventType;
  sourceEventPayload: Record<string, unknown>;
  entity: Record<string, unknown>;
};

export type WorkflowActionExecutionResult =
  | {
      status: "ok";
      channel: string;
      target: string | null;
      providerMessageId?: string | null;
    }
  | {
      status: "invalid_action";
      message: string;
    };

export type WorkflowActionDefinition = {
  id: string;
  integrationKey: string;
  label: string;
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

const TRIGGER_ENTITY_BY_PREFIX: Record<string, string> = {
  appointment: "appointment",
  calendar: "calendar",
  appointment_type: "appointment_type",
  resource: "resource",
  location: "location",
  client: "client",
};

function getEntityTypeForEventType(eventType: WebhookEventType): string {
  const [prefix] = eventType.split(".");
  if (!prefix) {
    return "unknown";
  }

  return TRIGGER_ENTITY_BY_PREFIX[prefix] ?? "unknown";
}

function isTerminalEventType(eventType: WebhookEventType): boolean {
  return (
    eventType.endsWith(".cancelled") ||
    eventType.endsWith(".deleted") ||
    eventType.endsWith(".no_show")
  );
}

const workflowTriggerRegistry: readonly WorkflowTriggerDefinition[] =
  webhookEventTypes.map((eventType) => ({
    eventType,
    entityType: getEntityTypeForEventType(eventType),
    defaultReplacementMode: isTerminalEventType(eventType)
      ? "cancel_without_replacement"
      : "replace_active",
  }));

const workflowActionRegistry = [
  {
    id: "resend.sendEmail",
    integrationKey: "resend",
    label: "Send Email",
    inputSchema: z
      .object({
        to: z.email(),
        subject: z.string().trim().min(1),
        body: z.string().trim().min(1),
        from: z.email().optional(),
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
  };
}
