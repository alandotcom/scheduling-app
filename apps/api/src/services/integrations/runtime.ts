import { getLogger } from "@logtape/logtape";
import type { IntegrationConsumer } from "@integrations/core";
import type { AppIntegrationKey } from "@scheduling/dto";
import { withOrg } from "../../lib/db.js";
import { integrationRepository } from "../../repositories/integrations.js";
import {
  getAllAppManagedIntegrationConsumers,
  getAppManagedIntegrationConsumersByKeys,
  isAppManagedIntegrationKey,
} from "./app-managed.js";
import { getEnabledIntegrations as getSystemEnabledIntegrations } from "./registry.js";

const logger = getLogger(["integrations", "runtime"]);
const ENABLED_INTEGRATIONS_CACHE_TTL_MS = 10_000;

const enabledIntegrationsByOrgId = new Map<
  string,
  {
    expiresAt: number;
    integrations: readonly IntegrationConsumer[];
  }
>();

function dedupeIntegrationsByName(
  integrations: readonly IntegrationConsumer[],
): readonly IntegrationConsumer[] {
  const deduped = new Map<string, IntegrationConsumer>();
  for (const integration of integrations) {
    if (!deduped.has(integration.name)) {
      deduped.set(integration.name, integration);
    }
  }
  return Array.from(deduped.values());
}

function toAppIntegrationKeys(values: readonly string[]): AppIntegrationKey[] {
  return values.filter((value): value is AppIntegrationKey =>
    isAppManagedIntegrationKey(value),
  );
}

export function getRuntimeIntegrationConsumersForWorkers(): readonly IntegrationConsumer[] {
  return dedupeIntegrationsByName([
    ...getSystemEnabledIntegrations(),
    ...getAllAppManagedIntegrationConsumers(),
  ]);
}

export async function getEnabledIntegrationsForOrg(
  orgId: string,
): Promise<readonly IntegrationConsumer[]> {
  const now = Date.now();
  const cached = enabledIntegrationsByOrgId.get(orgId);
  if (cached && cached.expiresAt > now) {
    return cached.integrations;
  }

  const enabledAppManagedKeys = await withOrg(orgId, (tx) =>
    integrationRepository.listEnabledKeys(tx, orgId),
  );

  const appManagedIntegrations = getAppManagedIntegrationConsumersByKeys(
    toAppIntegrationKeys(enabledAppManagedKeys),
  );

  const combined = dedupeIntegrationsByName([
    ...getSystemEnabledIntegrations(),
    ...appManagedIntegrations,
  ]);

  enabledIntegrationsByOrgId.set(orgId, {
    integrations: combined,
    expiresAt: now + ENABLED_INTEGRATIONS_CACHE_TTL_MS,
  });

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
