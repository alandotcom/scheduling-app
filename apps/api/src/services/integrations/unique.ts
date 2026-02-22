import type { IntegrationConsumer } from "./contract.js";

export function assertUniqueIntegrationNames(
  integrations: readonly IntegrationConsumer[],
): readonly IntegrationConsumer[] {
  const seenNames = new Set<string>();

  for (const integration of integrations) {
    if (seenNames.has(integration.name)) {
      throw new Error(
        `Duplicate integration name "${integration.name}" detected. Integration names must be globally unique.`,
      );
    }

    seenNames.add(integration.name);
  }

  return integrations;
}
