import { describe, test, expect } from "bun:test";

describe("Availability Routes Module", () => {
  test("availability routes module exists and exports correctly", async () => {
    const { availabilityRoutes } = await import("./availability.js");

    expect(availabilityRoutes).toBeDefined();
    expect(availabilityRoutes.rules).toBeDefined();
    expect(availabilityRoutes.overrides).toBeDefined();
    expect(availabilityRoutes.blockedTime).toBeDefined();
    expect(availabilityRoutes.schedulingLimits).toBeDefined();
    expect(availabilityRoutes.engine).toBeDefined();
    expect(availabilityRoutes.engine.dates).toBeDefined();
    expect(availabilityRoutes.engine.times).toBeDefined();
    expect(availabilityRoutes.engine.check).toBeDefined();
  });

  test("main router includes availability routes", async () => {
    const { router } = await import("./index.js");
    const routerAny = router as any;

    expect(routerAny.availability).toBeDefined();
    expect(routerAny.availability.rules).toBeDefined();
    expect(routerAny.availability.overrides).toBeDefined();
    expect(routerAny.availability.blockedTime).toBeDefined();
    expect(routerAny.availability.schedulingLimits).toBeDefined();
    expect(routerAny.availability.engine).toBeDefined();
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

    expect(uiRouterAny.apiTokens).toBeDefined();
    expect(uiRouterAny.audit).toBeDefined();
    expect(apiRouterAny.apiTokens).toBeUndefined();
    expect(apiRouterAny.audit).toBeUndefined();
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
    expect(uiAvailability.schedulingLimits).toBeDefined();

    expect(apiAvailability.dates).toBeDefined();
    expect(apiAvailability.times).toBeDefined();
    expect(apiAvailability.check).toBeDefined();
    expect(apiAvailability.rules).toBeUndefined();
    expect(apiAvailability.overrides).toBeUndefined();
  });
});
