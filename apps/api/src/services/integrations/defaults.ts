import { getLogger } from "@logtape/logtape";
import { forEachAsync } from "es-toolkit/array";
import { orgs } from "@scheduling/db/schema";
import { db, withOrg } from "../../lib/db.js";
import { integrationRepository } from "../../repositories/integrations.js";
import {
  createDefaultIntegrationConfig,
  getAppManagedIntegrationDefinitions,
} from "./app-managed.js";

const logger = getLogger(["integrations", "defaults"]);

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

export async function backfillAppIntegrationDefaultsForAllOrgs(): Promise<void> {
  const orgRows = await db.select({ orgId: orgs.id }).from(orgs);

  await forEachAsync(
    orgRows,
    async ({ orgId }) => {
      await ensureAppIntegrationDefaultsForOrg(orgId);
    },
    { concurrency: 5 },
  );

  logger.info("Ensured app integration defaults for all orgs", {
    orgCount: orgRows.length,
  });
}
