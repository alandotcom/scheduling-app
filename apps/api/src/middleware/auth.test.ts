import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { Hono } from "hono";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import { auth } from "../lib/auth.js";
import { authMiddleware } from "./auth.js";
import {
  closeTestDb,
  createOrg,
  createOrgMember,
  createTestDb,
  resetTestDb,
} from "../test-utils/index.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

function createProbeApp() {
  const app = new Hono();
  app.use("*", authMiddleware);
  app.get("/probe", (c) =>
    c.json({
      userId: c.get("userId"),
      orgId: c.get("orgId"),
      sessionId: c.get("sessionId"),
      tokenId: c.get("tokenId"),
      authMethod: c.get("authMethod"),
      role: c.get("role"),
    }),
  );
  app.get("/admin-probe", (c) => {
    const role = c.get("role");
    if (role !== "admin" && role !== "owner") {
      return c.json(
        { error: { code: "FORBIDDEN", message: "Admin access required" } },
        403,
      );
    }
    return c.json({ success: true as const });
  });
  return app;
}

describe("Auth Middleware - API Key Security", () => {
  let db: Database;
  const originalGetSession = auth.api.getSession;
  const originalVerifyApiKey = auth.api.verifyApiKey;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    (auth.api as typeof auth.api).getSession = originalGetSession;
    (auth.api as typeof auth.api).verifyApiKey = originalVerifyApiKey;
  });

  test("allows unauthenticated requests to continue with null auth context", async () => {
    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: false,
      key: null,
      error: { message: "invalid", code: "UNAUTHORIZED" },
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(new Request("http://localhost/probe"));
    const payload = (await response.json()) as {
      userId: string | null;
      orgId: string | null;
      sessionId: string | null;
      tokenId: string | null;
      authMethod: "session" | "token" | null;
      role: "owner" | "admin" | "member" | null;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      userId: null,
      orgId: null,
      sessionId: null,
      tokenId: null,
      authMethod: null,
      role: null,
    });
    expect(verifyApiKeyMock).not.toHaveBeenCalled();
  });

  test("rejects invalid API keys", async () => {
    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: false,
      key: null,
      error: { message: "invalid", code: "UNAUTHORIZED" },
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer invalid-key",
        },
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(payload.error.message).toBe("Invalid API key");
    expect(verifyApiKeyMock).toHaveBeenCalledWith({
      body: { key: "invalid-key" },
    });
  });

  test("rejects keys missing organization metadata", async () => {
    const { user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93001",
        userId: user.id,
        metadata: null,
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer key-without-org",
        },
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(payload.error.message).toBe(
      "API key is missing organization metadata",
    );
  });

  test("rejects keys for users who are not members of the metadata org", async () => {
    const { org: orgA } = await createOrg(db, { name: "Org A" });
    const { user: userB } = await createOrg(db, { name: "Org B" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93002",
        userId: userB.id,
        metadata: { organizationId: orgA.id, role: "member" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer cross-org-key",
        },
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(payload.error.message).toBe(
      "API key user is not a member of this organization",
    );
  });

  test("sets token auth context for valid API key members", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93003",
        userId: user.id,
        metadata: { organizationId: org.id, role: "admin" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer valid-key",
        },
      }),
    );
    const payload = (await response.json()) as {
      userId: string | null;
      orgId: string | null;
      sessionId: string | null;
      tokenId: string | null;
      authMethod: "session" | "token" | null;
      role: "owner" | "admin" | "member" | null;
    };

    expect(response.status).toBe(200);
    expect(payload.userId).toBe(user.id);
    expect(payload.orgId).toBe(org.id);
    expect(payload.sessionId).toBeNull();
    expect(payload.tokenId).toBe("0198d09f-ff07-7f46-a5d9-26a3f0d93003");
    expect(payload.authMethod).toBe("token");
    expect(payload.role).toBe("admin");
  });

  test("downscopes key role when metadata role exceeds membership role", async () => {
    const { org } = await createOrg(db, { name: "Org A" });
    const member = await createOrgMember(db, org.id, {
      email: "member@example.com",
      role: "member",
    });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93004",
        userId: member.id,
        metadata: { organizationId: org.id, role: "owner" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer elevated-key",
        },
      }),
    );
    const payload = (await response.json()) as { role: string | null };

    expect(response.status).toBe(200);
    expect(payload.role).toBe("member");
  });

  test("preserves narrower key role when membership role is higher", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93005",
        userId: user.id,
        metadata: { organizationId: org.id, role: "member" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer least-privileged-key",
        },
      }),
    );
    const payload = (await response.json()) as { role: string | null };

    expect(response.status).toBe(200);
    expect(payload.role).toBe("member");
  });

  test("prefers Bearer token over x-api-key when both headers are present", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(
      async ({ body }: { body: { key: string } }) => {
        if (body.key === "bearer-key") {
          return {
            valid: true,
            key: {
              id: "0198d09f-ff07-7f46-a5d9-26a3f0d93006",
              userId: user.id,
              metadata: { organizationId: org.id, role: "member" as const },
            },
            error: null,
          };
        }
        return {
          valid: false,
          key: null,
          error: { message: "invalid", code: "UNAUTHORIZED" },
        };
      },
    );
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/probe", {
        headers: {
          Authorization: "Bearer bearer-key",
          "x-api-key": "header-key",
        },
      }),
    );
    const payload = (await response.json()) as { tokenId: string | null };

    expect(response.status).toBe(200);
    expect(payload.tokenId).toBe("0198d09f-ff07-7f46-a5d9-26a3f0d93006");
    expect(verifyApiKeyMock).toHaveBeenCalledWith({
      body: { key: "bearer-key" },
    });
  });

  test("member-scoped key cannot pass admin guard", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93007",
        userId: user.id,
        metadata: { organizationId: org.id, role: "member" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/admin-probe", {
        headers: { Authorization: "Bearer member-key" },
      }),
    );
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
  });

  test("admin-scoped key passes admin guard", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d93008",
        userId: user.id,
        metadata: { organizationId: org.id, role: "admin" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const app = createProbeApp();
    const response = await app.fetch(
      new Request("http://localhost/admin-probe", {
        headers: { Authorization: "Bearer admin-key" },
      }),
    );
    const payload = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
  });
});
