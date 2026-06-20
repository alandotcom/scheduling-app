import {
  assertActionType,
  normalizeActionType,
  JourneyDeliveryNonRetryableError,
  resolveTestModeResult,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
} from "./delivery-dispatch-helpers.js";
import {
  normalizeEmailValue,
  normalizeOptionalString,
  resolveResendConfigForOrg,
  resolveResendIntegrationTestRecipient,
  sendResendEmail,
  type ResendIntegrationConfig,
  type ResendSendPayload,
} from "../integrations/resend/delivery.js";
import { ProviderSendError } from "../integrations/provider-send-error.js";
import { loadDeliveryTemplateContextByRun } from "./journey-template-context.js";
import {
  resolveReference,
  resolveTemplateString,
} from "./template-resolution.js";

// Journey-side email dispatcher: renders the journey step config into a Resend
// payload (recipients, from/reply-to, subject/body or template), honors
// test-mode, then calls DOWN into the thin Resend adapter.
type ResendDispatcherDependencies = {
  resolveTestRecipient?: (orgId: string) => Promise<string | null>;
  resolveConfig?: (orgId: string) => Promise<ResendIntegrationConfig>;
  loadTemplateContext?: (input: {
    orgId: string;
    triggerEntityType: "appointment" | "client";
    appointmentId?: string | null;
    clientId?: string | null;
  }) => Promise<Record<string, unknown>>;
  sendEmail?: (input: {
    apiKey: string;
    payload: ResendSendPayload;
    idempotencyKey?: string;
  }) => Promise<{ providerMessageId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveTemplateVariableValue(
  value: unknown,
  context: Record<string, unknown>,
): string | number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("@") && !trimmed.includes(" ")) {
    const resolved = resolveReference(trimmed, context);
    if (typeof resolved === "string" || typeof resolved === "number") {
      return resolved;
    }
    if (typeof resolved === "boolean") {
      return String(resolved);
    }
  }

  const resolvedString = resolveTemplateString(trimmed, context);
  if (resolvedString === null) {
    return "";
  }

  return resolvedString;
}

function resolveTemplateVariables(
  value: unknown,
  context: Record<string, unknown>,
): Record<string, string | number> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const variables: Record<string, string | number> = {};

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const key = normalizeOptionalString(entry["key"]);
    if (!key) {
      continue;
    }

    const resolvedValue = resolveTemplateVariableValue(entry["value"], context);
    if (resolvedValue === null) {
      continue;
    }

    variables[key] = resolvedValue;
  }

  if (Object.keys(variables).length === 0) {
    return undefined;
  }

  return variables;
}

function parseEmailList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const entries = value
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const emails: string[] = [];
  for (const entry of entries) {
    const normalized = normalizeEmailValue(entry);
    if (!normalized) {
      throw new JourneyDeliveryNonRetryableError(
        `Invalid email address "${entry}".`,
      );
    }
    emails.push(normalized);
  }

  return emails;
}

function resolveOptionalEmailField(
  value: unknown,
  context: Record<string, unknown>,
): string | null {
  const resolved = resolveTemplateString(value, context);
  if (!resolved) {
    return null;
  }

  const normalized = normalizeEmailValue(resolved);
  if (!normalized) {
    throw new JourneyDeliveryNonRetryableError(
      `Invalid email address "${resolved}".`,
    );
  }

  return normalized;
}

function formatFromAddress(input: {
  fromAddress: string;
  fromName: string | null;
}): string {
  if (!input.fromName) {
    return input.fromAddress;
  }

  return `${input.fromName} <${input.fromAddress}>`;
}

async function loadResendTemplateContext(
  input: JourneyDeliveryDispatchInput,
  dependencies: ResendDispatcherDependencies,
): Promise<Record<string, unknown>> {
  if (dependencies.loadTemplateContext) {
    return dependencies.loadTemplateContext({
      orgId: input.orgId,
      triggerEntityType: input.triggerEntityType ?? "appointment",
      appointmentId: input.appointmentId ?? null,
      clientId: input.clientId ?? null,
    });
  }

  if (input.appointmentId || input.triggerEntityType === "client") {
    return loadDeliveryTemplateContextByRun({
      orgId: input.orgId,
      triggerEntityType: input.triggerEntityType ?? "appointment",
      appointmentId: input.appointmentId ?? null,
      clientId: input.clientId ?? null,
    });
  }

  return {};
}

function resolveRecipients(
  stepConfig: Record<string, unknown>,
  context: Record<string, unknown>,
): string[] {
  const explicitRecipient =
    resolveTemplateString(stepConfig["toEmail"], context) ??
    resolveTemplateString(stepConfig["toAddress"], context) ??
    resolveTemplateString(stepConfig["to"], context);
  const explicitRecipients = parseEmailList(explicitRecipient);
  if (explicitRecipients.length > 0) {
    return explicitRecipients;
  }

  const fallbackRecipient =
    resolveOptionalEmailField("@client.data.email", context) ??
    resolveOptionalEmailField("@Appointment.data.client.email", context);
  if (!fallbackRecipient) {
    throw new JourneyDeliveryNonRetryableError(
      "Resend recipient is missing or invalid. Expected a client email address in the delivery context.",
    );
  }

  return [fallbackRecipient];
}

export async function dispatchJourneySendResendAction(
  input: JourneyDeliveryDispatchInput,
  dependencies: ResendDispatcherDependencies = {},
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, "send-resend", "send-resend-template");

  const testResult = await resolveTestModeResult({
    providerKey: "resend",
    idempotencyKey: input.idempotencyKey,
    stepConfig: input.stepConfig,
    runMode: input.runMode ?? "live",
    orgId: input.orgId,
    resolveTestRecipient:
      dependencies.resolveTestRecipient ??
      resolveResendIntegrationTestRecipient,
  });
  if (testResult) {
    return testResult;
  }

  const context = await loadResendTemplateContext(input, dependencies);
  const resolveConfig = dependencies.resolveConfig ?? resolveResendConfigForOrg;
  const resendConfig = await resolveConfig(input.orgId);

  const fromAddressOverride = resolveOptionalEmailField(
    input.stepConfig["fromAddress"],
    context,
  );
  const fromNameOverride = normalizeOptionalString(
    resolveTemplateString(input.stepConfig["fromName"], context),
  );
  const replyToOverride = resolveOptionalEmailField(
    input.stepConfig["replyTo"],
    context,
  );
  const cc = parseEmailList(
    resolveTemplateString(input.stepConfig["cc"], context),
  );
  const bcc = parseEmailList(
    resolveTemplateString(input.stepConfig["bcc"], context),
  );
  const to = resolveRecipients(input.stepConfig, context);

  const from = formatFromAddress({
    fromAddress: fromAddressOverride ?? resendConfig.defaultFromAddress,
    fromName: fromNameOverride ?? resendConfig.defaultFromName,
  });
  const replyTo = replyToOverride ?? resendConfig.defaultReplyTo ?? undefined;

  const actionType = normalizeActionType(input.stepConfig["actionType"]);
  if (actionType !== "send-resend" && actionType !== "send-resend-template") {
    throw new JourneyDeliveryNonRetryableError(
      "Action type mismatch. Expected one of: send-resend, send-resend-template.",
    );
  }

  let payload: ResendSendPayload;
  if (actionType === "send-resend") {
    const subject = resolveTemplateString(input.stepConfig["subject"], context);
    if (!subject) {
      throw new JourneyDeliveryNonRetryableError(
        "Resend email step requires a non-empty subject.",
      );
    }

    const message = resolveTemplateString(input.stepConfig["message"], context);
    if (!message) {
      throw new JourneyDeliveryNonRetryableError(
        "Resend email step requires a non-empty body.",
      );
    }

    const toValue: string | string[] = to.length === 1 ? to[0]! : to;
    payload = {
      from,
      to: toValue,
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
      ...(replyTo ? { replyTo } : {}),
      subject,
      text: message,
    };
  } else {
    const templateIdOrAlias = resolveTemplateString(
      input.stepConfig["templateIdOrAlias"],
      context,
    );
    if (!templateIdOrAlias) {
      throw new JourneyDeliveryNonRetryableError(
        "Resend template step requires a templateIdOrAlias value.",
      );
    }

    const templateVariables = resolveTemplateVariables(
      input.stepConfig["templateVariables"],
      context,
    );

    const toValue: string | string[] = to.length === 1 ? to[0]! : to;
    payload = {
      from,
      to: toValue,
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {}),
      ...(replyTo ? { replyTo } : {}),
      template: {
        id: templateIdOrAlias,
        ...(templateVariables ? { variables: templateVariables } : {}),
      },
    };
  }

  const sendEmail = dependencies.sendEmail ?? sendResendEmail;
  try {
    const sent = await sendEmail({
      apiKey: resendConfig.apiKey,
      payload,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      providerMessageId: sent.providerMessageId,
      reasonCode: null,
    };
  } catch (error) {
    if (error instanceof ProviderSendError && !error.retryable) {
      throw new JourneyDeliveryNonRetryableError(error.message, {
        cause: error,
      });
    }
    throw error;
  }
}
