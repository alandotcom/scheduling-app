import {
  getIntegrationSettingsInputSchema,
  integrationSettingsSchema,
  integrationSummarySchema,
  integrationsListResponseSchema,
  updateIntegrationInputSchema,
  updateIntegrationSecretsInputSchema,
  updateIntegrationSecretsResponseSchema,
  type AppIntegrationKey,
} from "@scheduling/dto";
import { getLogger } from "@logtape/logtape";
import { adminOnly } from "./base.js";
import { config } from "../config.js";
import { ApplicationError } from "../errors/application-error.js";
import { withOrg } from "../lib/db.js";
import { integrationRepository } from "../repositories/integrations.js";
import {
  createDefaultIntegrationConfig,
  getAppManagedIntegrationDefinition,
  getAppManagedIntegrationDefinitions,
} from "../services/integrations/app-managed.js";
import {
  decryptIntegrationSecrets,
  encryptIntegrationSecrets,
} from "../services/integrations/crypto.js";
import { ensureAppIntegrationDefaultsForOrg } from "../services/integrations/defaults.js";
import { invalidateEnabledIntegrationsForOrgCache } from "../services/integrations/runtime.js";

const logger = getLogger(["integrations", "routes"]);

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

function toConfig(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function getFallbackSecretFields(
  key: readonly string[],
): Record<string, boolean> {
  return Object.fromEntries(key.map((secretKey) => [secretKey, false]));
}

function resolveSecretFields(input: {
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
  } catch (error) {
    logger.warn(
      "Failed to decrypt integration secrets when resolving settings",
      {
        integrationKey: input.integrationKey,
        error,
      },
    );

    return getFallbackSecretFields(definition.requiredSecretKeys);
  }
}

function isIntegrationConfigured(input: {
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

async function loadIntegrationSettings(orgId: string, key: AppIntegrationKey) {
  const row = await withOrg(orgId, (tx) =>
    integrationRepository.findByKey(tx, orgId, key),
  );

  const definition = getAppManagedIntegrationDefinition(key);
  const integrationConfig = row
    ? toConfig(row.config)
    : createDefaultIntegrationConfig(key);
  const secretFields = resolveSecretFields({
    integrationKey: key,
    secretsEncrypted: row?.secretsEncrypted ?? null,
    secretSalt: row?.secretSalt ?? null,
  });

  return integrationSettingsSchema.parse({
    key: definition.key,
    name: definition.name,
    description: definition.description,
    logoUrl: definition.logoUrl,
    enabled: row?.enabled ?? definition.defaultEnabled,
    configured: isIntegrationConfigured({
      integrationKey: key,
      config: integrationConfig,
      secretFields,
    }),
    hasSettingsPanel: definition.hasSettingsPanel,
    config: integrationConfig,
    secretFields,
  });
}

export const list = adminOnly
  .route({ method: "GET", path: "/integrations" })
  .output(integrationsListResponseSchema)
  .handler(async ({ context }) => {
    const rows = await withOrg(context.orgId, (tx) =>
      integrationRepository.listByOrg(tx, context.orgId),
    );

    const rowByKey = new Map(rows.map((row) => [row.key, row]));

    const items = getAppManagedIntegrationDefinitions().map((definition) => {
      const row = rowByKey.get(definition.key);
      const integrationConfig = toConfig(row?.config);
      const secretFields = resolveSecretFields({
        integrationKey: definition.key,
        secretsEncrypted: row?.secretsEncrypted ?? null,
        secretSalt: row?.secretSalt ?? null,
      });

      return integrationSummarySchema.parse({
        key: definition.key,
        name: definition.name,
        description: definition.description,
        logoUrl: definition.logoUrl,
        enabled: row?.enabled ?? definition.defaultEnabled,
        configured: isIntegrationConfigured({
          integrationKey: definition.key,
          config: integrationConfig,
          secretFields,
        }),
        hasSettingsPanel: definition.hasSettingsPanel,
      });
    });

    return { items };
  });

export const getSettings = adminOnly
  .route({ method: "GET", path: "/integrations/{key}/settings" })
  .input(getIntegrationSettingsInputSchema)
  .output(integrationSettingsSchema)
  .handler(async ({ context, input }) => {
    return loadIntegrationSettings(context.orgId, input.key);
  });

export const update = adminOnly
  .route({ method: "PATCH", path: "/integrations/{key}" })
  .input(updateIntegrationInputSchema)
  .output(integrationSummarySchema)
  .handler(async ({ context, input }) => {
    await ensureAppIntegrationDefaultsForOrg(context.orgId);

    const definition = getAppManagedIntegrationDefinition(input.key);

    const updated = await withOrg(context.orgId, async (tx) => {
      const current = await integrationRepository.findByKey(
        tx,
        context.orgId,
        input.key,
      );

      if (!current) {
        throw new ApplicationError("Integration not found", {
          code: "NOT_FOUND",
        });
      }

      const currentConfig = toConfig(current.config);
      const nextConfig =
        input.config !== undefined
          ? { ...currentConfig, ...input.config }
          : currentConfig;

      const updateInput = {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        config: nextConfig,
      };

      return integrationRepository.update(tx, context.orgId, input.key, {
        ...updateInput,
      });
    });

    if (!updated) {
      throw new ApplicationError("Integration not found", {
        code: "NOT_FOUND",
      });
    }

    invalidateEnabledIntegrationsForOrgCache(context.orgId);

    const secretFields = resolveSecretFields({
      integrationKey: input.key,
      secretsEncrypted: updated.secretsEncrypted,
      secretSalt: updated.secretSalt,
    });

    return integrationSummarySchema.parse({
      key: definition.key,
      name: definition.name,
      description: definition.description,
      logoUrl: definition.logoUrl,
      enabled: updated.enabled,
      configured: isIntegrationConfigured({
        integrationKey: input.key,
        config: toConfig(updated.config),
        secretFields,
      }),
      hasSettingsPanel: definition.hasSettingsPanel,
    });
  });

export const updateSecrets = adminOnly
  .route({ method: "PATCH", path: "/integrations/{key}/secrets" })
  .input(updateIntegrationSecretsInputSchema)
  .output(updateIntegrationSecretsResponseSchema)
  .handler(async ({ context, input }) => {
    const pepper = config.integrations.encryptionKey;
    if (!pepper) {
      throw new ApplicationError(
        "INTEGRATIONS_ENCRYPTION_KEY is not configured",
        {
          code: "BAD_REQUEST",
        },
      );
    }

    await ensureAppIntegrationDefaultsForOrg(context.orgId);

    await withOrg(context.orgId, async (tx) => {
      const current = await integrationRepository.findByKey(
        tx,
        context.orgId,
        input.key,
      );

      if (!current) {
        throw new ApplicationError("Integration not found", {
          code: "NOT_FOUND",
        });
      }

      let mergedSecrets = input.secrets;

      if (current.secretsEncrypted && current.secretSalt) {
        try {
          const existingSecrets = decryptIntegrationSecrets({
            secretsEncrypted: current.secretsEncrypted,
            secretSalt: current.secretSalt,
            pepper,
          });
          mergedSecrets = {
            ...existingSecrets,
            ...input.secrets,
          };
        } catch (error) {
          logger.warn(
            "Failed to decrypt existing integration secrets before update",
            {
              integrationKey: input.key,
              error,
            },
          );
        }
      }

      const { secretsEncrypted, secretSalt } = encryptIntegrationSecrets({
        secrets: mergedSecrets,
        pepper,
      });

      const updated = await integrationRepository.updateSecrets(
        tx,
        context.orgId,
        input.key,
        secretsEncrypted,
        secretSalt,
      );

      if (!updated) {
        throw new ApplicationError("Integration not found", {
          code: "NOT_FOUND",
        });
      }
    });

    invalidateEnabledIntegrationsForOrgCache(context.orgId);

    return { success: true as const };
  });

export const integrationRoutes = {
  list,
  getSettings,
  update,
  updateSecrets,
};
