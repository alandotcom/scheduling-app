import { describe, expect, test } from "bun:test";
import { createIntegration } from "./contract.js";
import { assertUniqueIntegrationNames } from "./unique.js";

describe("assertUniqueIntegrationNames", () => {
  test("returns integrations when names are unique", () => {
    const logger = createIntegration({
      name: "logger",
      supportedEventTypes: ["*"],
      async process() {},
    });
    const svix = createIntegration({
      name: "svix",
      supportedEventTypes: ["*"],
      async process() {},
    });

    expect(assertUniqueIntegrationNames([logger, svix])).toEqual([
      logger,
      svix,
    ]);
  });

  test("throws when duplicate names are detected", () => {
    const loggerA = createIntegration({
      name: "logger",
      supportedEventTypes: ["*"],
      async process() {},
    });
    const loggerB = createIntegration({
      name: "logger",
      supportedEventTypes: ["*"],
      async process() {},
    });

    expect(() => assertUniqueIntegrationNames([loggerA, loggerB])).toThrow(
      'Duplicate integration name "logger" detected.',
    );
  });
});
