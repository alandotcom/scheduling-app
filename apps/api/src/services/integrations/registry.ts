import { getLogger } from "@logtape/logtape";
import type { IntegrationConsumer } from "./contract.js";
import { config } from "../../config.js";
import { isAppManagedIntegrationKey } from "./app-managed.js";
import { svixIntegration } from "./svix.js";

const logger = getLogger(["integrations", "registry"]);

const allIntegrations: readonly IntegrationConsumer[] = [svixIntegration];

const integrationByName = new Map<string, IntegrationConsumer>(
  allIntegrations.map((integration) => [integration.name, integration]),
);

function parseEnabledIntegrationNames(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
}

export function getRegisteredIntegrations(): readonly IntegrationConsumer[] {
  return allIntegrations;
}

export function getEnabledIntegrations(): readonly IntegrationConsumer[] {
  const enabledNames = parseEnabledIntegrationNames(
    config.integrations.enabled,
  );

  for (const name of enabledNames) {
    if (!integrationByName.has(name) && !isAppManagedIntegrationKey(name)) {
      logger.warn(
        "Unknown integration configured in INTEGRATIONS_ENABLED: {integrationName}",
        {
          integrationName: name,
        },
      );
    }
  }

  const enabledIntegrations = allIntegrations.filter((integration) =>
    enabledNames.has(integration.name),
  );

  logger.info("Loaded integrations", {
    enabledIntegrationNames: enabledIntegrations.map((i) => i.name),
  });

  return enabledIntegrations;
}
