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
  getAppManagedIntegrationDefinition,
  getAppManagedIntegrationDefinitions,
} from "../services/integrations/app-managed.js";
import {
  decryptIntegrationSecrets,
  encryptIntegrationSecrets,
} from "../services/integrations/crypto.js";
import { ensureAppIntegrationDefaultsForOrg } from "../services/integrations/defaults.js";
import {
  getAppIntegrationState,
  isAppIntegrationConfigured,
  resolveSecretFields,
  toConfig,
} from "../services/integrations/readiness.js";
import { invalidateEnabledIntegrationsForOrgCache } from "../services/integrations/runtime.js";

const logger = getLogger(["integrations", "routes"]);
async function loadIntegrationSettings(orgId: string, key: AppIntegrationKey) {
  const state = await withOrg(orgId, (tx) =>
    getAppIntegrationState({
      tx,
      orgId,
      key,
    }),
  );

  const definition = getAppManagedIntegrationDefinition(key);

  return integrationSettingsSchema.parse({
    key: definition.key,
    name: definition.name,
    description: definition.description,
    logoUrl: definition.logoUrl,
    enabled: state.enabled,
    configured: state.configured,
    hasSettingsPanel: definition.hasSettingsPanel,
    config: state.config,
    secretFields: state.secretFields,
    configSchema: definition.configSchema,
    secretSchema: definition.secretSchema,
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
        configured: isAppIntegrationConfigured({
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
      const secretFields = resolveSecretFields({
        integrationKey: input.key,
        secretsEncrypted: current.secretsEncrypted,
        secretSalt: current.secretSalt,
      });
      const nextConfigured = isAppIntegrationConfigured({
        integrationKey: input.key,
        config: nextConfig,
        secretFields,
      });

      if (input.enabled === true && !nextConfigured) {
        throw new ApplicationError(
          "Integration must be fully configured before it can be enabled",
          {
            code: "BAD_REQUEST",
          },
        );
      }

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
      configured: isAppIntegrationConfigured({
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

      let mergedSecrets: Record<string, string> = {};

      if (current.secretsEncrypted && current.secretSalt) {
        try {
          const existingSecrets = decryptIntegrationSecrets({
            secretsEncrypted: current.secretsEncrypted,
            secretSalt: current.secretSalt,
            pepper,
          });
          mergedSecrets = existingSecrets;
        } catch (error) {
          logger.warn(
            "Failed to decrypt existing integration secrets before update",
            {
              integrationKey: input.key,
              error,
            },
          );

          throw new ApplicationError(
            "Stored integration secrets could not be decrypted",
            {
              code: "CONFLICT",
              cause: error,
            },
          );
        }
      }

      const clearKeys = new Set(input.clear ?? []);
      for (const clearKey of clearKeys) {
        delete mergedSecrets[clearKey];
      }

      if (input.set) {
        mergedSecrets = {
          ...mergedSecrets,
          ...input.set,
        };
      }

      const hasSecrets = Object.keys(mergedSecrets).length > 0;
      const encrypted = hasSecrets
        ? encryptIntegrationSecrets({
            secrets: mergedSecrets,
            pepper,
          })
        : null;

      const updated = await integrationRepository.updateSecrets(
        tx,
        context.orgId,
        input.key,
        encrypted?.secretsEncrypted ?? null,
        encrypted?.secretSalt ?? null,
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
