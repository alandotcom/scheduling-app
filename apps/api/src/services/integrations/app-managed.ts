import type { IntegrationConsumer } from "@integrations/core";
import { loggerIntegration } from "@integrations/logger";
import type { AppIntegrationKey } from "@scheduling/dto";

export interface AppManagedIntegrationDefinition {
  key: AppIntegrationKey;
  name: string;
  description: string;
  logoUrl: string | null;
  hasSettingsPanel: boolean;
  defaultEnabled: boolean;
  defaultConfig: Record<string, unknown>;
  requiredConfigKeys: readonly string[];
  requiredSecretKeys: readonly string[];
  consumer: IntegrationConsumer;
}

const appManagedIntegrations: readonly AppManagedIntegrationDefinition[] = [
  {
    key: "logger",
    name: "Event Logger",
    description:
      "Writes outbound domain events to structured logs for debugging and traceability.",
    logoUrl: null,
    hasSettingsPanel: true,
    defaultEnabled: false,
    defaultConfig: {},
    requiredConfigKeys: [],
    requiredSecretKeys: [],
    consumer: loggerIntegration,
  },
] as const;

const appManagedIntegrationByKey = new Map<
  AppIntegrationKey,
  AppManagedIntegrationDefinition
>(appManagedIntegrations.map((integration) => [integration.key, integration]));

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
  return appManagedIntegrationByKey.has(value as AppIntegrationKey);
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
  return appManagedIntegrations.map((integration) => integration.consumer);
}

export function createDefaultIntegrationConfig(
  key: AppIntegrationKey,
): Record<string, unknown> {
  return structuredClone(getAppManagedIntegrationDefinition(key).defaultConfig);
}
