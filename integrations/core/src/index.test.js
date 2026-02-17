import { describe, expect, test } from "bun:test";
import { createIntegration, integrationSupportsEvent } from "./index.ts";

describe("createIntegration", () => {
  test("normalizes integration names", () => {
    const integration = createIntegration({
      name: "  Logger  ",
      supportedEventTypes: ["*"],
      async process() {},
    });

    expect(integration.name).toBe("logger");
  });

  test("throws when integration name is invalid", () => {
    expect(() =>
      createIntegration({
        name: "logger integration",
        supportedEventTypes: ["*"],
        async process() {},
      }),
    ).toThrow('Invalid integration name "logger integration"');
  });

  test("throws when supported event types are empty", () => {
    expect(() =>
      createIntegration({
        name: "logger",
        supportedEventTypes: [],
        async process() {},
      }),
    ).toThrow("Integration must support at least one event type.");
  });
});

describe("integrationSupportsEvent", () => {
  test("supports wildcard selectors", () => {
    const integration = createIntegration({
      name: "all-events",
      supportedEventTypes: ["*"],
      async process() {},
    });

    expect(integrationSupportsEvent(integration, "appointment.scheduled")).toBe(
      true,
    );
    expect(integrationSupportsEvent(integration, "location.deleted")).toBe(
      true,
    );
  });

  test("supports only explicitly configured event types", () => {
    const integration = createIntegration({
      name: "appointment-scheduled-only",
      supportedEventTypes: ["appointment.scheduled"],
      async process() {},
    });

    expect(integrationSupportsEvent(integration, "appointment.scheduled")).toBe(
      true,
    );
    expect(
      integrationSupportsEvent(integration, "appointment.rescheduled"),
    ).toBe(false);
  });
});
