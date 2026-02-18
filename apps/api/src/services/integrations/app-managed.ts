import type { IntegrationConsumer } from "@integrations/core";
import { loggerIntegration } from "@integrations/logger";
import type {
  AppIntegrationKey,
  IntegrationAuthStrategy,
  IntegrationConfigField,
  IntegrationSecretField,
} from "@scheduling/dto";

export interface AppManagedIntegrationDefinition {
  key: AppIntegrationKey;
  name: string;
  description: string;
  logoUrl: string | null;
  hasSettingsPanel: boolean;
  authStrategy: IntegrationAuthStrategy;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
  configSchema: readonly IntegrationConfigField[];
  secretSchema: readonly IntegrationSecretField[];
  requiredConfigKeys: readonly string[];
  requiredSecretKeys: readonly string[];
  consumer?: IntegrationConsumer;
}

const appManagedIntegrations: readonly AppManagedIntegrationDefinition[] = [
  {
    key: "logger",
    name: "Event Logger",
    description:
      "Writes outbound domain events to structured logs for debugging and traceability.",
    logoUrl: null,
    hasSettingsPanel: true,
    authStrategy: "manual",
    defaultEnabled: false,
    defaultConfig: {},
    configSchema: [],
    secretSchema: [],
    requiredConfigKeys: [],
    requiredSecretKeys: [],
    consumer: loggerIntegration,
  },
  {
    key: "resend",
    name: "Resend",
    description: "Send workflow emails with Resend.",
    logoUrl: "https://cdn.resend.com/brand/resend-icon-black.svg",
    hasSettingsPanel: true,
    authStrategy: "manual",
    defaultEnabled: false,
    defaultConfig: {
      fromEmail: "",
      fromName: "",
      replyTo: "",
      testRecipientEmail: "",
    },
    configSchema: [
      {
        key: "fromEmail",
        label: "From email",
        description:
          'Sender email address. When From name is set, emails are sent as "From name <from email>".',
        placeholder: "notifications@example.com",
        required: true,
        inputType: "email",
      },
      {
        key: "fromName",
        label: "From name",
        description:
          "Optional display name prepended to From email (Name <email@domain.com>).",
        placeholder: "Acme Scheduling",
        required: false,
        inputType: "text",
      },
      {
        key: "replyTo",
        label: "Reply-to email",
        description: "Optional default reply-to address.",
        placeholder: "support@example.com",
        required: false,
        inputType: "email",
      },
      {
        key: "testRecipientEmail",
        label: "Test recipient email",
        description:
          "Optional safe recipient used for workflow Test mode routing.",
        placeholder: "qa@example.com",
        required: false,
        inputType: "email",
      },
    ],
    secretSchema: [
      {
        key: "apiKey",
        label: "API key",
        description: "Resend API key (starts with re_).",
        placeholder: "re_...",
        required: true,
      },
    ],
    requiredConfigKeys: ["fromEmail"],
    requiredSecretKeys: ["apiKey"],
  },
  {
    key: "slack",
    name: "Slack",
    description: "Send workflow notifications to Slack channels.",
    logoUrl:
      "https://a.slack-edge.com/80588/marketing/img/meta/slack_hash_256.png",
    hasSettingsPanel: true,
    authStrategy: "oauth",
    defaultEnabled: false,
    defaultConfig: {
      oauth: {
        connectedAt: null,
        accountLabel: null,
        scope: null,
        tokenType: null,
        accessTokenExpiresAt: null,
        teamId: null,
        teamName: null,
        botUserId: null,
      },
    },
    configSchema: [],
    secretSchema: [],
    requiredConfigKeys: [],
    requiredSecretKeys: ["accessToken"],
  },
] as const;

const appManagedIntegrationByKey = new Map<
  AppIntegrationKey,
  AppManagedIntegrationDefinition
>(appManagedIntegrations.map((integration) => [integration.key, integration]));
const appManagedIntegrationKeySet = new Set<string>(
  appManagedIntegrations.map((integration) => integration.key),
);

export function getAppManagedIntegrationDefinitions(): readonly AppManagedIntegrationDefinition[] {
  return appManagedIntegrations;
}

export function getAppManagedIntegrationKeys(): readonly AppIntegrationKey[] {
  return appManagedIntegrations.map((integration) => integration.key);
}

export function getAppManagedIntegrationDefinition(
  key: AppIntegrationKey,
): AppManagedIntegrationDefinition {
  const integration = appManagedIntegrationByKey.get(key);
  if (!integration) {
    throw new Error(`Unknown app-managed integration key: ${key}`);
  }

  return integration;
}

export function isAppManagedIntegrationKey(
  value: string,
): value is AppIntegrationKey {
  return appManagedIntegrationKeySet.has(value);
}

export function getAppManagedIntegrationConsumersByKeys(
  keys: readonly AppIntegrationKey[],
): readonly IntegrationConsumer[] {
  return keys
    .map((key) => appManagedIntegrationByKey.get(key)?.consumer)
    .filter(
      (integration): integration is IntegrationConsumer =>
        integration !== undefined,
    );
}

export function getAllAppManagedIntegrationConsumers(): readonly IntegrationConsumer[] {
  return appManagedIntegrations
    .map((integration) => integration.consumer)
    .filter(
      (integration): integration is IntegrationConsumer =>
        integration !== undefined,
    );
}

export function createDefaultIntegrationConfig(
  key: AppIntegrationKey,
): Record<string, unknown> {
  return structuredClone(getAppManagedIntegrationDefinition(key).defaultConfig);
}
