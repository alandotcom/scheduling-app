import {
  domainEventDomains,
  domainEventTypesByDomain,
  type AppIntegrationKey,
  type DomainEventDomain,
  type DomainEventType,
  type WorkflowActionConfigField,
  type WorkflowOutputField,
} from "@scheduling/dto";
import { Resend } from "resend";
import { z } from "zod";
import {
  getAppIntegrationSecretsForOrg,
  getAppIntegrationStateForOrg,
} from "../integrations/readiness.js";

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

const emailSchema = z.email();

function toTrimmedStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

function parseTemplateData(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return {};
    }

    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("Template data must be a JSON object");
    }
    return parsed;
  }

  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("Template data must be an object");
  }

  return value;
}

function toResendTemplateVariables(
  value: unknown,
): Record<string, string | number> {
  const parsed = parseTemplateData(value);
  const variables: Record<string, string | number> = {};

  for (const [key, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue === "string" || typeof rawValue === "number") {
      variables[key] = rawValue;
      continue;
    }

    if (typeof rawValue === "boolean" || typeof rawValue === "bigint") {
      variables[key] = `${rawValue}`;
      continue;
    }

    if (rawValue === null || rawValue === undefined) {
      variables[key] = "";
      continue;
    }

    variables[key] = JSON.stringify(rawValue);
  }

  return variables;
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
  {
    id: "resend.sendEmail",
    label: "Send Email (Resend)",
    description: "Send an email through Resend",
    category: "Integrations",
    requiresIntegration: {
      key: "resend",
      mode: "enabled_and_configured",
    },
    configFields: [
      {
        key: "to",
        label: "To",
        type: "template-input" as const,
        placeholder: "client@example.com",
        required: true,
      },
      {
        key: "subject",
        label: "Subject",
        type: "template-input" as const,
        placeholder: "Appointment update",
        required: true,
      },
      {
        key: "mode",
        label: "Content mode",
        type: "select" as const,
        options: [
          { value: "content", label: "Content" },
          { value: "template", label: "Template" },
        ],
      },
      {
        key: "text",
        label: "Text body",
        type: "template-textarea" as const,
        placeholder: "Plain-text body",
        rows: 5,
        showWhen: { field: "mode", equals: "content" },
      },
      {
        key: "html",
        label: "HTML body",
        type: "template-textarea" as const,
        placeholder: "<p>HTML body</p>",
        rows: 8,
        showWhen: { field: "mode", equals: "content" },
      },
      {
        key: "templateId",
        label: "Template ID",
        type: "text" as const,
        placeholder: "tmpl_xxx",
        showWhen: { field: "mode", equals: "template" },
      },
      {
        key: "templateData",
        label: "Template variables (JSON)",
        type: "template-textarea" as const,
        placeholder: '{"firstName":"Taylor","time":"10:00 AM"}',
        rows: 6,
        showWhen: { field: "mode", equals: "template" },
      },
      {
        key: "fromEmail",
        label: "From email override",
        type: "template-input" as const,
        placeholder: "notifications@example.com",
      },
      {
        key: "fromName",
        label: "From name override",
        type: "template-input" as const,
        placeholder: "Acme Scheduling",
      },
      {
        key: "replyTo",
        label: "Reply-to override",
        type: "template-input" as const,
        placeholder: "support@example.com",
      },
    ],
    outputFields: [
      { field: "channel", description: "Execution channel" },
      { field: "target", description: "Correlated entity target" },
      { field: "providerMessageId", description: "Resend message id" },
      { field: "mode", description: "Send mode used for delivery" },
      { field: "to", description: "Recipient email address" },
      { field: "subject", description: "Email subject line" },
    ],
    inputSchema: z
      .object({
        to: z.string().trim().min(1),
        subject: z.string().trim().min(1),
        mode: z.enum(["content", "template"]).default("content"),
        text: z.string().optional(),
        html: z.string().optional(),
        templateId: z.string().optional(),
        templateData: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .optional(),
        fromEmail: z.string().optional(),
        fromName: z.string().optional(),
        replyTo: z.string().optional(),
      })
      .loose()
      .superRefine((value, ctx) => {
        const toEmail = toTrimmedStringOrNull(value.to);
        if (!toEmail || !isValidEmail(toEmail)) {
          ctx.addIssue({
            code: "custom",
            path: ["to"],
            message: "To must be a valid email address",
          });
        }

        const fromEmail = toTrimmedStringOrNull(value.fromEmail);
        if (fromEmail && !isValidEmail(fromEmail)) {
          ctx.addIssue({
            code: "custom",
            path: ["fromEmail"],
            message: "From email override must be a valid email address",
          });
        }

        const replyTo = toTrimmedStringOrNull(value.replyTo);
        if (replyTo && !isValidEmail(replyTo)) {
          ctx.addIssue({
            code: "custom",
            path: ["replyTo"],
            message: "Reply-to override must be a valid email address",
          });
        }

        if (value.mode === "content") {
          const text = toTrimmedStringOrNull(value.text);
          const html = toTrimmedStringOrNull(value.html);
          if (!text && !html) {
            ctx.addIssue({
              code: "custom",
              path: ["text"],
              message: "Provide text or html when mode is content",
            });
          }
          return;
        }

        const templateId = toTrimmedStringOrNull(value.templateId);
        if (!templateId) {
          ctx.addIssue({
            code: "custom",
            path: ["templateId"],
            message: "Template ID is required when mode is template",
          });
        }

        if (value.templateData !== undefined) {
          try {
            parseTemplateData(value.templateData);
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              path: ["templateData"],
              message:
                error instanceof Error
                  ? error.message
                  : "Template data must be a JSON object",
            });
          }
        }
      }),
    execute: async ({ parsedInput, context }) => {
      const target = `${context.entityType}:${context.entityId}`;
      const state = await getAppIntegrationStateForOrg(context.orgId, "resend");
      const secrets = await getAppIntegrationSecretsForOrg({
        orgId: context.orgId,
        key: "resend",
      });

      const apiKey = toTrimmedStringOrNull(secrets["apiKey"]);
      if (!apiKey) {
        throw new Error("Resend integration API key is not configured");
      }

      const fromEmail =
        toTrimmedStringOrNull(parsedInput["fromEmail"]) ??
        toTrimmedStringOrNull(state.config["fromEmail"]);
      if (!fromEmail || !isValidEmail(fromEmail)) {
        throw new Error("Resend integration fromEmail is not configured");
      }

      const fromName =
        toTrimmedStringOrNull(parsedInput["fromName"]) ??
        toTrimmedStringOrNull(state.config["fromName"]);
      const replyTo =
        toTrimmedStringOrNull(parsedInput["replyTo"]) ??
        toTrimmedStringOrNull(state.config["replyTo"]);

      const to = toTrimmedStringOrNull(parsedInput["to"]);
      const subject = toTrimmedStringOrNull(parsedInput["subject"]);
      if (!to || !subject) {
        throw new Error("Resend action requires to and subject");
      }

      const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
      const resend = new Resend(apiKey);
      const mode = parsedInput["mode"] === "template" ? "template" : "content";
      const text = toTrimmedStringOrNull(parsedInput["text"]);
      const html = toTrimmedStringOrNull(parsedInput["html"]);

      const response = await (() => {
        if (mode === "template") {
          return resend.emails.send({
            from,
            to,
            subject,
            ...(replyTo ? { replyTo } : {}),
            template: {
              id: toTrimmedStringOrNull(parsedInput["templateId"])!,
              variables: toResendTemplateVariables(parsedInput["templateData"]),
            },
          });
        }

        if (text && html) {
          return resend.emails.send({
            from,
            to,
            subject,
            ...(replyTo ? { replyTo } : {}),
            text,
            html,
          });
        }

        if (text) {
          return resend.emails.send({
            from,
            to,
            subject,
            ...(replyTo ? { replyTo } : {}),
            text,
          });
        }

        if (html) {
          return resend.emails.send({
            from,
            to,
            subject,
            ...(replyTo ? { replyTo } : {}),
            html,
          });
        }

        throw new Error("Provide text or html when mode is content");
      })();

      if (response.error) {
        throw new Error(`Resend send failed: ${response.error.message}`);
      }

      return {
        channel: "resend.sendEmail",
        target,
        providerMessageId: response.data?.id ?? null,
        output: {
          channel: "resend.sendEmail",
          target,
          mode,
          to,
          subject,
          providerMessageId: response.data?.id ?? null,
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
