import { getLogger } from "@logtape/logtape";
import type { IntegrationConsumer } from "./contract.js";
import type { AppIntegrationKey } from "@scheduling/dto";
import { LRUCache } from "lru-cache";
import { withOrg } from "../../lib/db.js";
import { integrationRepository } from "../../repositories/integrations.js";
import {
  getAllAppManagedIntegrationConsumers,
  getAppManagedIntegrationConsumersByKeys,
  isAppManagedIntegrationKey,
} from "./app-managed.js";
import { getEnabledIntegrations as getSystemEnabledIntegrations } from "./registry.js";
import { assertUniqueIntegrationNames } from "./unique.js";

const logger = getLogger(["integrations", "runtime"]);
const ENABLED_INTEGRATIONS_CACHE_TTL_MS = 10_000;

const enabledIntegrationsByOrgId = new LRUCache<
  string,
  readonly IntegrationConsumer[]
>({
  max: 500,
  ttl: ENABLED_INTEGRATIONS_CACHE_TTL_MS,
});

function toAppIntegrationKeys(values: readonly string[]): AppIntegrationKey[] {
  return values.filter((value): value is AppIntegrationKey =>
    isAppManagedIntegrationKey(value),
  );
}

export function getRuntimeIntegrationConsumersForWorkers(): readonly IntegrationConsumer[] {
  return assertUniqueIntegrationNames([
    ...getSystemEnabledIntegrations(),
    ...getAllAppManagedIntegrationConsumers(),
  ]);
}

export async function getEnabledIntegrationsForOrg(
  orgId: string,
): Promise<readonly IntegrationConsumer[]> {
  const cached = enabledIntegrationsByOrgId.get(orgId);
  if (cached) {
    return cached;
  }

  const enabledAppManagedKeys = await withOrg(orgId, (tx) =>
    integrationRepository.listEnabledKeys(tx, orgId),
  );

  const appManagedIntegrations = getAppManagedIntegrationConsumersByKeys(
    toAppIntegrationKeys(enabledAppManagedKeys),
  );

  const combined = assertUniqueIntegrationNames([
    ...getSystemEnabledIntegrations(),
    ...appManagedIntegrations,
  ]);

  enabledIntegrationsByOrgId.set(orgId, combined);

  logger.debug("Resolved enabled integrations for org", {
    orgId,
    enabledIntegrationNames: combined.map((integration) => integration.name),
  });

  return combined;
}

export function invalidateEnabledIntegrationsForOrgCache(orgId: string): void {
  enabledIntegrationsByOrgId.delete(orgId);
}

export function clearEnabledIntegrationsCache(): void {
  enabledIntegrationsByOrgId.clear();
}
