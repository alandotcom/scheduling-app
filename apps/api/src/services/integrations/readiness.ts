import { getLogger } from "@logtape/logtape";
import type {
  AppIntegrationKey,
  IntegrationOAuthStatus,
} from "@scheduling/dto";
import type { DbClient } from "../../lib/db.js";
import { config } from "../../config.js";
import { withOrg } from "../../lib/db.js";
import { isRecord } from "../../lib/type-guards.js";
import type { IntegrationRow } from "../../repositories/integrations.js";
import { integrationRepository } from "../../repositories/integrations.js";
import {
  createDefaultIntegrationConfig,
  getAppManagedIntegrationDefinition,
  getRequiredConfigKeys,
  getRequiredSecretKeys,
} from "./app-managed.js";
import { decryptIntegrationSecrets } from "./crypto.js";

const logger = getLogger(["integrations", "readiness"]);

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
  if (isRecord(value)) {
    const integrationConfig: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      integrationConfig[key] = entryValue;
    }
    return integrationConfig;
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
  const requiredKeys = getRequiredSecretKeys(definition);

  if (requiredKeys.length === 0) {
    return {};
  }

  if (!input.secretsEncrypted || !input.secretSalt) {
    return getFallbackSecretFields(requiredKeys);
  }

  const pepper = config.integrations.encryptionKey;
  if (!pepper) {
    return getFallbackSecretFields(requiredKeys);
  }

  try {
    const decrypted = decryptIntegrationSecrets({
      secretsEncrypted: input.secretsEncrypted,
      secretSalt: input.secretSalt,
      pepper,
    });

    return Object.fromEntries(
      requiredKeys.map((secretKey) => [
        secretKey,
        hasConfiguredValue(decrypted[secretKey]),
      ]),
    );
  } catch (error) {
    logger.warn(
      "Failed to decrypt integration secrets for {integrationKey}: {error}",
      { integrationKey: input.integrationKey, error },
    );
    return getFallbackSecretFields(requiredKeys);
  }
}

export function isAppIntegrationConfigured(input: {
  integrationKey: AppIntegrationKey;
  config: Record<string, unknown>;
  secretFields: Record<string, boolean>;
}): boolean {
  const definition = getAppManagedIntegrationDefinition(input.integrationKey);

  const hasRequiredConfig = getRequiredConfigKeys(definition).every(
    (configKey) => hasConfiguredValue(input.config[configKey]),
  );
  const hasRequiredSecrets = getRequiredSecretKeys(definition).every(
    (secretKey) => input.secretFields[secretKey] === true,
  );

  return hasRequiredConfig && hasRequiredSecrets;
}

export function resolveOAuthStatus(input: {
  integrationKey: AppIntegrationKey;
  config: Record<string, unknown>;
  secretFields: Record<string, boolean>;
}): IntegrationOAuthStatus | undefined {
  const definition = getAppManagedIntegrationDefinition(input.integrationKey);
  if (definition.authStrategy !== "oauth") {
    return undefined;
  }

  const oauthValue = input.config["oauth"];
  const oauthConfig = isRecord(oauthValue) ? oauthValue : {};
  const connected = getRequiredSecretKeys(definition).every(
    (secretKey) => input.secretFields[secretKey] === true,
  );

  return {
    connected,
    connectedAt:
      typeof oauthConfig["connectedAt"] === "string"
        ? oauthConfig["connectedAt"]
        : null,
    accountLabel:
      typeof oauthConfig["accountLabel"] === "string"
        ? oauthConfig["accountLabel"]
        : null,
    canDisconnect: true,
  };
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

export async function getAppIntegrationSecretsForOrg(input: {
  orgId: string;
  key: AppIntegrationKey;
}): Promise<Record<string, string>> {
  const row = await withOrg(input.orgId, async (tx) =>
    integrationRepository.findByKey(tx, input.orgId, input.key),
  );

  if (!row?.secretsEncrypted || !row.secretSalt) {
    return {};
  }

  const pepper = config.integrations.encryptionKey;
  if (!pepper) {
    return {};
  }

  try {
    return decryptIntegrationSecrets({
      secretsEncrypted: row.secretsEncrypted,
      secretSalt: row.secretSalt,
      pepper,
    });
  } catch (error) {
    logger.warn(
      "Failed to decrypt integration secrets for {key} in org {orgId}: {error}",
      { key: input.key, orgId: input.orgId, error },
    );
    return {};
  }
}
