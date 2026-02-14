import { describe, expect, test } from "bun:test";
import type { IntegrationSettings, IntegrationSummary } from "@scheduling/dto";
import {
  getOrderedIntegrationsForDisplay,
  shouldHydrateIntegrationDrafts,
  splitIntegrationsByEnabled,
} from "./integrations-section";

const loggerSettings: IntegrationSettings = {
  key: "logger",
  name: "Logger",
  description: "Writes to logs",
  logoUrl: null,
  enabled: true,
  configured: true,
  hasSettingsPanel: true,
  authStrategy: "manual",
  config: {},
  secretFields: {},
  configSchema: [],
  secretSchema: [],
};

function makeIntegration(
  overrides: Partial<IntegrationSummary> = {},
): IntegrationSummary {
  return {
    key: "logger",
    name: "Logger",
    description: "Write workflow output to application logs",
    logoUrl: null,
    enabled: false,
    configured: false,
    hasSettingsPanel: true,
    authStrategy: "manual",
    ...overrides,
  };
}

const baseIntegrations: IntegrationSummary[] = [makeIntegration()];

describe("getOrderedIntegrationsForDisplay", () => {
  test("filters by name, description, and key", () => {
    const byName = getOrderedIntegrationsForDisplay({
      integrations: baseIntegrations,
      searchQuery: "log",
    });
    const byDescription = getOrderedIntegrationsForDisplay({
      integrations: baseIntegrations,
      searchQuery: "application",
    });
    const byKey = getOrderedIntegrationsForDisplay({
      integrations: baseIntegrations,
      searchQuery: "logger",
    });

    expect(byName).toHaveLength(1);
    expect(byDescription).toHaveLength(1);
    expect(byKey).toHaveLength(1);
  });

  test("returns empty array when no integrations match the search query", () => {
    const result = getOrderedIntegrationsForDisplay({
      integrations: baseIntegrations,
      searchQuery: "twilio",
    });

    expect(result).toEqual([]);
  });

  test("sorts enabled integrations before disabled integrations", () => {
    const ordered = getOrderedIntegrationsForDisplay({
      integrations: [
        makeIntegration({
          name: "Logger",
          enabled: false,
        }),
        makeIntegration({
          name: "A Logger",
          enabled: true,
        }),
      ],
      searchQuery: "",
    });

    expect(ordered[0]?.enabled).toBe(true);
    expect(ordered[1]?.enabled).toBe(false);
  });
});

describe("splitIntegrationsByEnabled", () => {
  test("partitions integrations into enabled and disabled buckets", () => {
    const result = splitIntegrationsByEnabled([
      makeIntegration({ enabled: true }),
      makeIntegration({ enabled: false }),
    ]);

    expect(result.enabledIntegrations).toHaveLength(1);
    expect(result.disabledIntegrations).toHaveLength(1);
  });
});

describe("shouldHydrateIntegrationDrafts", () => {
  test("hydrates when settings load for a newly selected integration", () => {
    expect(
      shouldHydrateIntegrationDrafts({
        selectedIntegrationKey: "logger",
        selectedIntegrationSettings: loggerSettings,
        draftHydratedForKey: null,
      }),
    ).toBe(true);
  });

  test("does not rehydrate for background refetches of the same integration", () => {
    expect(
      shouldHydrateIntegrationDrafts({
        selectedIntegrationKey: "logger",
        selectedIntegrationSettings: loggerSettings,
        draftHydratedForKey: "logger",
      }),
    ).toBe(false);
  });

  test("does not hydrate when no integration is selected", () => {
    expect(
      shouldHydrateIntegrationDrafts({
        selectedIntegrationKey: null,
        selectedIntegrationSettings: loggerSettings,
        draftHydratedForKey: null,
      }),
    ).toBe(false);
  });
});
