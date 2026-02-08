import { afterEach, describe, expect, mock, test } from "bun:test";
import { call } from "@orpc/server";
import { auth } from "../lib/auth.js";
import type { Context } from "../lib/orpc.js";
import { apiKeyRoutes } from "./api-keys.js";

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

describe("API Key Routes", () => {
  const originalListApiKeys = auth.api.listApiKeys;
  const originalCreateApiKey = auth.api.createApiKey;
  const originalGetApiKey = auth.api.getApiKey;
  const originalDeleteApiKey = auth.api.deleteApiKey;

  afterEach(() => {
    (auth.api as typeof auth.api).listApiKeys = originalListApiKeys;
    (auth.api as typeof auth.api).createApiKey = originalCreateApiKey;
    (auth.api as typeof auth.api).getApiKey = originalGetApiKey;
    (auth.api as typeof auth.api).deleteApiKey = originalDeleteApiKey;
  });

  test("list returns only keys for the active organization, newest first", async () => {
    const context = createContext({
      orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
      role: "admin",
    });

    const listApiKeysMock = mock(async () => [
      {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d91001",
        name: "Older Org Key",
        prefix: "sched_",
        start: "sched_abc",
        metadata: {
          organizationId: context.orgId,
          role: "admin",
        },
        expiresAt: null,
        lastRequest: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d91002",
        name: "Newer Org Key",
        prefix: "sched_",
        start: "sched_def",
        metadata: JSON.stringify({
          organizationId: context.orgId,
          role: "member",
        }),
        expiresAt: null,
        lastRequest: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d91003",
        name: "Other Org Key",
        prefix: "sched_",
        start: "sched_xyz",
        metadata: {
          organizationId: "0198d09f-ff07-7f46-a5d9-26a3f0d99999",
          role: "owner",
        },
        expiresAt: null,
        lastRequest: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d91004",
        name: "Invalid Metadata",
        prefix: "sched_",
        start: "sched_bad",
        metadata: "{bad json",
        expiresAt: null,
        lastRequest: null,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    ]);

    (auth.api as typeof auth.api).listApiKeys =
      listApiKeysMock as unknown as typeof auth.api.listApiKeys;

    const result = await call(apiKeyRoutes.list, undefined as never, {
      context,
    });

    expect(listApiKeysMock).toHaveBeenCalledTimes(1);
    expect(listApiKeysMock).toHaveBeenCalledWith({
      headers: context.headers,
    });
    expect(result.items).toHaveLength(2);
    const itemIds = result.items.map((item) => item.id);
    expect(itemIds).toEqual([
      "0198d09f-ff07-7f46-a5d9-26a3f0d91002",
      "0198d09f-ff07-7f46-a5d9-26a3f0d91001",
    ]);
    expect(itemIds).not.toContain("0198d09f-ff07-7f46-a5d9-26a3f0d91003");
    expect(itemIds).not.toContain("0198d09f-ff07-7f46-a5d9-26a3f0d91004");
    expect(result.items.map((item) => item.scope)).toEqual(["member", "admin"]);
  });

  test("create rejects non-admin actors", async () => {
    const context = createContext({ role: "member" });
    const createApiKeyMock = mock(async () => ({
      id: "0198d09f-ff07-7f46-a5d9-26a3f0d92099",
    }));
    (auth.api as typeof auth.api).createApiKey =
      createApiKeyMock as unknown as typeof auth.api.createApiKey;

    await expect(
      call(
        apiKeyRoutes.create,
        {
          name: "Member Key",
          scope: "member",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createApiKeyMock).not.toHaveBeenCalled();
  });

  test("create rejects scope escalation above actor role", async () => {
    const context = createContext({ role: "admin" });

    await expect(
      call(
        apiKeyRoutes.create,
        {
          name: "Owner Key",
          scope: "owner",
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("create rejects expiration under 24 hours", async () => {
    const context = createContext({
      orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
      role: "owner",
    });
    const createApiKeyMock = mock(async () => ({
      id: "0198d09f-ff07-7f46-a5d9-26a3f0d92100",
    }));
    (auth.api as typeof auth.api).createApiKey =
      createApiKeyMock as unknown as typeof auth.api.createApiKey;

    await expect(
      call(
        apiKeyRoutes.create,
        {
          name: "Too Soon Key",
          scope: "member",
          expiresAt: new Date(Date.now() + (24 * 60 * 60 * 1000 - 1_000)),
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createApiKeyMock).not.toHaveBeenCalled();
  });

  test("create forwards Better Auth payload with org metadata", async () => {
    const orgId = "0198d09f-ff07-7f46-a5d9-26a3f0d90002";
    const context = createContext({
      orgId,
      role: "owner",
    });
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const createApiKeyMock = mock(
      async (args: {
        headers: Headers;
        body: {
          name?: string;
          expiresIn?: number;
          metadata?: {
            organizationId?: string;
            role?: "owner" | "admin" | "member";
          };
        };
      }) => ({
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d92001",
        name: args.body.name ?? null,
        prefix: "sched_",
        start: "sched_live",
        key: "sched_live_secret",
        expiresAt,
        lastRequest: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    );

    (auth.api as typeof auth.api).createApiKey =
      createApiKeyMock as unknown as typeof auth.api.createApiKey;

    const result = await call(
      apiKeyRoutes.create,
      {
        name: "Integration Key",
        scope: "admin",
        expiresAt,
      },
      { context },
    );

    expect(createApiKeyMock).toHaveBeenCalledTimes(1);
    const firstCall = createApiKeyMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const args = firstCall![0];
    expect(args.headers).toBe(context.headers);
    expect(args.body.metadata?.organizationId).toBe(orgId);
    expect(args.body.metadata).toMatchObject({ role: "admin" });
    expect(typeof args.body.expiresIn).toBe("number");
    expect((args.body.expiresIn ?? 0) >= 60 * 60 * 24).toBe(true);
    expect(result.key).toBe("sched_live_secret");
    expect(result.scope).toBe("admin");
  });

  test("create accepts expiration at least 24 hours in the future", async () => {
    const context = createContext({
      orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
      role: "owner",
    });
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + 2_000);
    const createApiKeyMock = mock(
      async (args: {
        headers: Headers;
        body: {
          name?: string;
          expiresIn?: number;
          metadata?: {
            organizationId?: string;
            role?: "owner" | "admin" | "member";
          };
        };
      }) => ({
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d92101",
        name: args.body.name ?? null,
        prefix: "sched_",
        start: "sched_boundary",
        key: "sched_boundary_secret",
        expiresAt,
        lastRequest: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    );
    (auth.api as typeof auth.api).createApiKey =
      createApiKeyMock as unknown as typeof auth.api.createApiKey;

    const result = await call(
      apiKeyRoutes.create,
      {
        name: "Boundary Key",
        scope: "member",
        expiresAt,
      },
      { context },
    );

    expect(createApiKeyMock).toHaveBeenCalledTimes(1);
    const firstCall = createApiKeyMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const args = firstCall![0];
    expect(typeof args.body.expiresIn).toBe("number");
    expect((args.body.expiresIn ?? 0) >= 60 * 60 * 24).toBe(true);
    expect(result.scope).toBe("member");
  });

  test("revoke rejects keys outside the active organization", async () => {
    const context = createContext({
      orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
      role: "owner",
    });

    const getApiKeyMock = mock(async () => ({
      id: "0198d09f-ff07-7f46-a5d9-26a3f0d92010",
      metadata: {
        organizationId: "0198d09f-ff07-7f46-a5d9-26a3f0d99999",
        role: "owner",
      },
    }));
    const deleteApiKeyMock = mock(async () => ({ success: true }));

    (auth.api as typeof auth.api).getApiKey =
      getApiKeyMock as unknown as typeof auth.api.getApiKey;
    (auth.api as typeof auth.api).deleteApiKey =
      deleteApiKeyMock as unknown as typeof auth.api.deleteApiKey;

    await expect(
      call(
        apiKeyRoutes.revoke,
        { id: "0198d09f-ff07-7f46-a5d9-26a3f0d92010" },
        { context },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deleteApiKeyMock).not.toHaveBeenCalled();
  });

  test("revoke deletes keys in the active organization", async () => {
    const context = createContext({
      orgId: "0198d09f-ff07-7f46-a5d9-26a3f0d90002",
      role: "owner",
    });

    const getApiKeyMock = mock(async () => ({
      id: "0198d09f-ff07-7f46-a5d9-26a3f0d92011",
      metadata: JSON.stringify({
        organizationId: context.orgId,
        role: "admin",
      }),
    }));
    const deleteApiKeyMock = mock(async () => ({ success: true }));

    (auth.api as typeof auth.api).getApiKey =
      getApiKeyMock as unknown as typeof auth.api.getApiKey;
    (auth.api as typeof auth.api).deleteApiKey =
      deleteApiKeyMock as unknown as typeof auth.api.deleteApiKey;

    const result = await call(
      apiKeyRoutes.revoke,
      { id: "0198d09f-ff07-7f46-a5d9-26a3f0d92011" },
      { context },
    );

    expect(getApiKeyMock).toHaveBeenCalledWith({
      headers: context.headers,
      query: { id: "0198d09f-ff07-7f46-a5d9-26a3f0d92011" },
    });
    expect(deleteApiKeyMock).toHaveBeenCalledWith({
      headers: context.headers,
      body: { keyId: "0198d09f-ff07-7f46-a5d9-26a3f0d92011" },
    });
    expect(result).toEqual({ success: true });
  });
});
