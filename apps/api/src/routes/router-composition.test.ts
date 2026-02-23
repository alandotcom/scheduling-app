import { describe, test, expect } from "bun:test";

describe("Availability Routes Module", () => {
  test("availability routes module exists and exports correctly", async () => {
    const { availabilityRoutes } = await import("./availability.js");

    expect(availabilityRoutes).toBeDefined();
    expect(availabilityRoutes.rules).toBeDefined();
    expect(availabilityRoutes.overrides).toBeDefined();
    expect(availabilityRoutes.blockedTime).toBeDefined();
    expect(availabilityRoutes.engine).toBeDefined();
    expect(availabilityRoutes.engine.dates).toBeDefined();
    expect(availabilityRoutes.engine.times).toBeDefined();
    expect(availabilityRoutes.engine.previewTimes).toBeDefined();
    expect(availabilityRoutes.engine.check).toBeDefined();
  });

  test("main router includes availability routes", async () => {
    const { router } = await import("./index.js");
    const routerAny = router as any;

    expect(routerAny.availability).toBeDefined();
    expect(routerAny.availability.rules).toBeDefined();
    expect(routerAny.availability.overrides).toBeDefined();
    expect(routerAny.availability.blockedTime).toBeDefined();
    expect(routerAny.availability.engine).toBeDefined();
    expect(routerAny.calendars.schedulingLimits).toBeDefined();
    expect(routerAny.org.settings.schedulingLimits).toBeDefined();
  });
});

describe("API vs UI Router", () => {
  test("apiRouter excludes admin-only routes", async () => {
    const { uiRouter, apiRouter } = (await import("./index.js")) as {
      uiRouter: unknown;
      apiRouter: unknown;
    };

    const uiRouterAny = uiRouter as any;
    const apiRouterAny = apiRouter as any;

    expect(uiRouterAny.audit).toBeDefined();
    expect(uiRouterAny.dashboard).toBeDefined();
    expect(uiRouterAny.apiKeys).toBeDefined();
    expect(uiRouterAny.integrations).toBeDefined();
    expect(uiRouterAny.webhooks).toBeDefined();
    expect(uiRouterAny.journeys).toBeDefined();
    expect(uiRouterAny.workflows).toBeUndefined();
    expect(apiRouterAny.audit).toBeUndefined();
    expect(apiRouterAny.dashboard).toBeUndefined();
    expect(apiRouterAny.apiKeys).toBeUndefined();
    expect(apiRouterAny.integrations).toBeUndefined();
    expect(apiRouterAny.webhooks).toBeUndefined();
    expect(apiRouterAny.workflows).toBeUndefined();
  });

  test("apiRouter exposes only availability engine routes", async () => {
    const { uiRouter, apiRouter } = (await import("./index.js")) as {
      uiRouter: unknown;
      apiRouter: unknown;
    };

    const uiRouterAny = uiRouter as any;
    const apiRouterAny = apiRouter as any;
    const uiAvailability = uiRouterAny.availability as any;
    const apiAvailability = apiRouterAny.availability as any;

    expect(uiAvailability.rules).toBeDefined();
    expect(uiAvailability.overrides).toBeDefined();
    expect(uiAvailability.blockedTime).toBeDefined();
    expect(uiAvailability.schedulingLimits).toBeUndefined();

    expect(apiAvailability.dates).toBeDefined();
    expect(apiAvailability.times).toBeDefined();
    expect(apiAvailability.previewTimes).toBeUndefined();
    expect(apiAvailability.check).toBeDefined();
    expect(apiAvailability.rules).toBeUndefined();
    expect(apiAvailability.overrides).toBeUndefined();
  });
});
