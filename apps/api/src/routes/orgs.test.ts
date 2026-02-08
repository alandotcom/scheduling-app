import { afterEach, describe, expect, mock, test } from "bun:test";
import { call } from "@orpc/server";
import { auth } from "../lib/auth.js";
import type { Context } from "../lib/orpc.js";
import * as orgRoutes from "./orgs.js";

function createContext(overrides: Partial<Context> = {}): Context {
  return {
    userId: "0198d09f-ff07-7f46-a5d9-26a3f0d90001",
    orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
    sessionId: "test-session",
    tokenId: null,
    authMethod: "session",
    role: "owner",
    headers: new Headers(),
    ...overrides,
  };
}

describe("Org Routes - Create/Switch", () => {
  const originalCreateOrganization = auth.api.createOrganization;
  const originalSetActiveOrganization = auth.api.setActiveOrganization;

  afterEach(() => {
    (auth.api as typeof auth.api).createOrganization =
      originalCreateOrganization;
    (auth.api as typeof auth.api).setActiveOrganization =
      originalSetActiveOrganization;
  });

  test("create forwards headers and provided slug to BetterAuth", async () => {
    const context = createContext();
    context.headers.set("cookie", "better-auth.session_token=test-token");

    const createOrganizationMock = mock(async () => ({
      id: "0198d09f-ff07-7f46-a5d9-26a3f0d9e001",
      name: "Acme Team",
      slug: "acme-team",
      createdAt: new Date(),
      logo: null,
      metadata: null,
    }));
    (auth.api as typeof auth.api).createOrganization =
      createOrganizationMock as unknown as typeof auth.api.createOrganization;

    const result = await call(
      orgRoutes.create,
      { name: "Acme Team", slug: "acme-team" },
      { context },
    );

    expect(createOrganizationMock).toHaveBeenCalledTimes(1);
    expect(createOrganizationMock).toHaveBeenCalledWith({
      headers: context.headers,
      body: { name: "Acme Team", slug: "acme-team" },
    });
    expect(result.slug).toBe("acme-team");
  });

  test("create generates a slug when one is not provided", async () => {
    const context = createContext();

    const createOrganizationMock = mock(
      async ({ body }: { body: { slug: string } }) => ({
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d9e002",
        name: "Acme East",
        slug: body.slug,
        createdAt: new Date(),
        logo: null,
        metadata: null,
      }),
    );
    (auth.api as typeof auth.api).createOrganization =
      createOrganizationMock as unknown as typeof auth.api.createOrganization;

    const result = await call(
      orgRoutes.create,
      { name: "Acme East" },
      { context },
    );

    expect(createOrganizationMock).toHaveBeenCalledTimes(1);
    const createArgs = createOrganizationMock.mock.calls[0]?.[0] as {
      body: { slug: string };
    };
    expect(createArgs.body.slug).toMatch(/^acme-east-[a-z0-9]{6}$/);
    expect(result.slug).toBe(createArgs.body.slug);
  });

  test("create throws BAD_REQUEST when BetterAuth returns null", async () => {
    const context = createContext();

    const createOrganizationMock = mock(async () => null);
    (auth.api as typeof auth.api).createOrganization =
      createOrganizationMock as unknown as typeof auth.api.createOrganization;

    await expect(
      call(orgRoutes.create, { name: "Will Fail" }, { context }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("setActive forwards headers and organizationId to BetterAuth", async () => {
    const context = createContext();
    context.headers.set("cookie", "better-auth.session_token=test-token");
    const targetOrganizationId = "0198d09f-ff07-7f46-a5d9-26a3f0d9e003";

    const setActiveMock = mock(async () => ({
      id: targetOrganizationId,
      name: "Switched Org",
      slug: "switched-org",
      createdAt: new Date(),
      logo: null,
      metadata: null,
    }));
    (auth.api as typeof auth.api).setActiveOrganization =
      setActiveMock as unknown as typeof auth.api.setActiveOrganization;

    const result = await call(
      orgRoutes.setActive,
      { organizationId: targetOrganizationId },
      { context },
    );

    expect(setActiveMock).toHaveBeenCalledTimes(1);
    expect(setActiveMock).toHaveBeenCalledWith({
      headers: context.headers,
      body: { organizationId: targetOrganizationId },
    });
    expect(result.id).toBe(targetOrganizationId);
  });

  test("setActive throws NOT_FOUND when BetterAuth returns null", async () => {
    const context = createContext();

    const setActiveMock = mock(async () => null);
    (auth.api as typeof auth.api).setActiveOrganization =
      setActiveMock as unknown as typeof auth.api.setActiveOrganization;

    await expect(
      call(
        orgRoutes.setActive,
        { organizationId: "00000000-0000-0000-0000-000000000000" },
        { context },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
