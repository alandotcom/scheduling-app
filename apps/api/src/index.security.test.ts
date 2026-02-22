import { afterEach, describe, expect, mock, test } from "bun:test";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import server from "./index.js";
import { auth } from "./lib/auth.js";
import {
  createLocation,
  createOrg,
  getTestDb,
  registerDbTestReset,
} from "./test-utils/index.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("OpenAPI API key security", () => {
  registerDbTestReset("per-file");
  const db = getTestDb() as Database;
  const originalGetSession = auth.api.getSession;
  const originalVerifyApiKey = auth.api.verifyApiKey;

  afterEach(() => {
    (auth.api as typeof auth.api).getSession = originalGetSession;
    (auth.api as typeof auth.api).verifyApiKey = originalVerifyApiKey;
  });

  test("scopes /api/v1/locations to the API key organization", async () => {
    const { org: orgA, user: userA } = await createOrg(db, { name: "Org A" });
    const { org: orgB } = await createOrg(db, { name: "Org B" });

    await createLocation(db, orgA.id, { name: "Org A Location" });
    await createLocation(db, orgB.id, { name: "Org B Location" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d94001",
        userId: userA.id,
        metadata: { organizationId: orgA.id, role: "owner" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const response = await server.fetch(
      new Request("http://localhost/api/v1/locations", {
        headers: {
          Authorization: "Bearer org-a-key",
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ id: string; orgId: string; name: string }>;
    };

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.name).toBe("Org A Location");
    expect(payload.items[0]?.orgId).toBe(orgA.id);
    expect(
      payload.items.find((item) => item.orgId === orgB.id),
    ).toBeUndefined();
    expect(verifyApiKeyMock).toHaveBeenCalledWith({
      body: { key: "org-a-key" },
    });
  });

  test("accepts x-api-key header for /api/v1 requests", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });

    await createLocation(db, org.id, { name: "Header Auth Location" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d94002",
        userId: user.id,
        metadata: { organizationId: org.id, role: "admin" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const response = await server.fetch(
      new Request("http://localhost/api/v1/locations", {
        headers: {
          "x-api-key": "header-key",
        },
      }),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      items: Array<{ name: string }>;
    };

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.name).toBe("Header Auth Location");
    expect(verifyApiKeyMock).toHaveBeenCalledWith({
      body: { key: "header-key" },
    });
  });

  test("rejects API keys without organization metadata", async () => {
    const { user } = await createOrg(db, { name: "Org A" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d94003",
        userId: user.id,
        metadata: null,
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const response = await server.fetch(
      new Request("http://localhost/api/v1/locations", {
        headers: {
          Authorization: "Bearer missing-org-metadata",
        },
      }),
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(payload.error.message).toBe(
      "API key is missing organization metadata",
    );
  });

  test("rejects API keys when the key user is not in the metadata org", async () => {
    const { org: orgA } = await createOrg(db, { name: "Org A" });
    const { user: userB } = await createOrg(db, { name: "Org B" });

    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: true,
      key: {
        id: "0198d09f-ff07-7f46-a5d9-26a3f0d94004",
        userId: userB.id,
        metadata: { organizationId: orgA.id, role: "member" as const },
      },
      error: null,
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const response = await server.fetch(
      new Request("http://localhost/api/v1/locations", {
        headers: {
          Authorization: "Bearer cross-org-key",
        },
      }),
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(payload.error.message).toBe(
      "API key user is not a member of this organization",
    );
  });

  test("rejects invalid or revoked API keys", async () => {
    const getSessionMock = mock(async () => null);
    const verifyApiKeyMock = mock(async () => ({
      valid: false,
      key: null,
      error: { message: "revoked", code: "UNAUTHORIZED" },
    }));
    (auth.api as typeof auth.api).getSession =
      getSessionMock as unknown as typeof auth.api.getSession;
    (auth.api as typeof auth.api).verifyApiKey =
      verifyApiKeyMock as unknown as typeof auth.api.verifyApiKey;

    const response = await server.fetch(
      new Request("http://localhost/api/v1/locations", {
        headers: {
          Authorization: "Bearer revoked-key",
        },
      }),
    );

    expect(response.status).toBe(401);
    const payload = (await response.json()) as {
      error: { code: string; message: string };
    };

    expect(payload.error.code).toBe("UNAUTHORIZED");
    expect(payload.error.message).toBe("Invalid API key");
    expect(verifyApiKeyMock).toHaveBeenCalledWith({
      body: { key: "revoked-key" },
    });
  });
});
