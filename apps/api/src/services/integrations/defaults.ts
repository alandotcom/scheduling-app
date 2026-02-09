import { withOrg } from "../../lib/db.js";
import { integrationRepository } from "../../repositories/integrations.js";
import {
  createDefaultIntegrationConfig,
  getAppManagedIntegrationDefinitions,
} from "./app-managed.js";

export async function ensureAppIntegrationDefaultsForOrg(
  orgId: string,
): Promise<void> {
  const definitions = getAppManagedIntegrationDefinitions();

  await withOrg(orgId, (tx) =>
    integrationRepository.ensureDefaults(
      tx,
      orgId,
      definitions.map((definition) => ({
        key: definition.key,
        enabled: definition.defaultEnabled,
        config: createDefaultIntegrationConfig(definition.key),
      })),
    ),
  );
}
