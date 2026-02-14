import type { AppIntegrationKey } from "@scheduling/dto";
import type { DbClient } from "../../lib/db.js";
import { config } from "../../config.js";
import { withOrg } from "../../lib/db.js";
import type { IntegrationRow } from "../../repositories/integrations.js";
import { integrationRepository } from "../../repositories/integrations.js";
import {
  createDefaultIntegrationConfig,
  getAppManagedIntegrationDefinition,
} from "./app-managed.js";
import { decryptIntegrationSecrets } from "./crypto.js";

export type AppManagedIntegrationState = {
  key: AppIntegrationKey;
  enabled: boolean;
  configured: boolean;
  config: Record<string, unknown>;
  secretFields: Record<string, boolean>;
};

export function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

export function toConfig(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const config: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      config[key] = entryValue;
    }
    return config;
  }

  return {};
}

function getFallbackSecretFields(
  keys: readonly string[],
): Record<string, boolean> {
  return Object.fromEntries(keys.map((secretKey) => [secretKey, false]));
}

export function resolveSecretFields(input: {
  integrationKey: AppIntegrationKey;
  secretsEncrypted: string | null;
  secretSalt: string | null;
}): Record<string, boolean> {
  const definition = getAppManagedIntegrationDefinition(input.integrationKey);

  if (definition.requiredSecretKeys.length === 0) {
    return {};
  }

  if (!input.secretsEncrypted || !input.secretSalt) {
    return getFallbackSecretFields(definition.requiredSecretKeys);
  }

  const pepper = config.integrations.encryptionKey;
  if (!pepper) {
    return getFallbackSecretFields(definition.requiredSecretKeys);
  }

  try {
    const decrypted = decryptIntegrationSecrets({
      secretsEncrypted: input.secretsEncrypted,
      secretSalt: input.secretSalt,
      pepper,
    });

    return Object.fromEntries(
      definition.requiredSecretKeys.map((secretKey) => [
        secretKey,
        hasConfiguredValue(decrypted[secretKey]),
      ]),
    );
  } catch {
    return getFallbackSecretFields(definition.requiredSecretKeys);
  }
}

export function isAppIntegrationConfigured(input: {
  integrationKey: AppIntegrationKey;
  config: Record<string, unknown>;
  secretFields: Record<string, boolean>;
}): boolean {
  const definition = getAppManagedIntegrationDefinition(input.integrationKey);

  const hasRequiredConfig = definition.requiredConfigKeys.every((configKey) =>
    hasConfiguredValue(input.config[configKey]),
  );
  const hasRequiredSecrets = definition.requiredSecretKeys.every(
    (secretKey) => input.secretFields[secretKey] === true,
  );

  return hasRequiredConfig && hasRequiredSecrets;
}

function toStateFromRow(
  key: AppIntegrationKey,
  row: IntegrationRow | null,
): AppManagedIntegrationState {
  const definition = getAppManagedIntegrationDefinition(key);
  const integrationConfig = row
    ? toConfig(row.config)
    : createDefaultIntegrationConfig(key);
  const secretFields = resolveSecretFields({
    integrationKey: key,
    secretsEncrypted: row?.secretsEncrypted ?? null,
    secretSalt: row?.secretSalt ?? null,
  });

  return {
    key,
    enabled: row?.enabled ?? definition.defaultEnabled,
    configured: isAppIntegrationConfigured({
      integrationKey: key,
      config: integrationConfig,
      secretFields,
    }),
    config: integrationConfig,
    secretFields,
  };
}

export async function getAppIntegrationStatesByKeys(input: {
  tx: DbClient;
  orgId: string;
  keys: readonly AppIntegrationKey[];
}): Promise<Map<AppIntegrationKey, AppManagedIntegrationState>> {
  const uniqueKeys = [...new Set(input.keys)];
  if (uniqueKeys.length === 0) {
    return new Map();
  }

  const rows = await integrationRepository.listByKeys(
    input.tx,
    input.orgId,
    uniqueKeys,
  );
  const rowByKey = new Map(rows.map((row) => [row.key, row]));

  const result = new Map<AppIntegrationKey, AppManagedIntegrationState>();
  for (const key of uniqueKeys) {
    const row = rowByKey.get(key) ?? null;
    result.set(key, toStateFromRow(key, row));
  }

  return result;
}

export async function getAppIntegrationState(input: {
  tx: DbClient;
  orgId: string;
  key: AppIntegrationKey;
}): Promise<AppManagedIntegrationState> {
  const row = await integrationRepository.findByKey(
    input.tx,
    input.orgId,
    input.key,
  );
  return toStateFromRow(input.key, row);
}

export async function getAppIntegrationStateForOrg(
  orgId: string,
  key: AppIntegrationKey,
): Promise<AppManagedIntegrationState> {
  return withOrg(orgId, async (tx) =>
    getAppIntegrationState({
      tx,
      orgId,
      key,
    }),
  );
}
