// Integration tests for API token routes

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { call } from "@orpc/server";
import { createHash } from "crypto";
import {
  createTestContext,
  createOrg,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as apiTokenRoutes from "./api-tokens.js";
import { apiTokens } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("API Token Routes", () => {
  let db: Database;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  async function createToken(ctx: ReturnType<typeof createTestContext>) {
    return call(
      apiTokenRoutes.create,
      { name: "Test Token", scope: "admin" },
      { context: ctx },
    );
  }

  test("returns empty list when no tokens exist", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const result = await call(
      apiTokenRoutes.list,
      { limit: 10 },
      { context: ctx },
    );

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("creates token and stores hash + prefix", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const created = await createToken(ctx);

    expect(created.token).toBeDefined();
    expect(created.tokenPrefix.startsWith("sk_live_")).toBe(true);
    expect(created.token.startsWith(created.tokenPrefix)).toBe(true);

    await setTestOrgContext(db, org.id);
    const [stored] = await db.select().from(apiTokens);
    const rawToken = created.token.slice(created.tokenPrefix.length);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    expect(stored!.tokenPrefix).toBe(created.tokenPrefix);
    expect(stored!.tokenHash).toBe(tokenHash);
  });

  test("list excludes revoked tokens by default", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const token1 = await createToken(ctx);
    const token2 = await createToken(ctx);

    await call(apiTokenRoutes.revoke, { id: token1.id }, { context: ctx });

    const active = await call(
      apiTokenRoutes.list,
      { limit: 10 },
      { context: ctx },
    );

    expect(active.items).toHaveLength(1);
    expect(active.items[0]!.id).toBe(token2.id);

    const all = await call(
      apiTokenRoutes.list,
      { limit: 10, includeRevoked: true },
      { context: ctx },
    );

    expect(all.items).toHaveLength(2);
  });

  test("gets a token without returning full token", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const created = await createToken(ctx);

    const fetched = await call(
      apiTokenRoutes.get,
      { id: created.id },
      { context: ctx },
    );

    expect(fetched.id).toBe(created.id);
    expect((fetched as { token?: string }).token).toBeUndefined();
  });

  test("updates token name", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const created = await createToken(ctx);

    const updated = await call(
      apiTokenRoutes.update,
      { id: created.id, data: { name: "Renamed" } },
      { context: ctx },
    );

    expect(updated.name).toBe("Renamed");
  });

  test("rejects update for revoked tokens", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const created = await createToken(ctx);
    await call(apiTokenRoutes.revoke, { id: created.id }, { context: ctx });

    await expect(
      call(
        apiTokenRoutes.update,
        { id: created.id, data: { name: "Nope" } },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("revokes a token", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const created = await createToken(ctx);

    const revoked = await call(
      apiTokenRoutes.revoke,
      { id: created.id },
      { context: ctx },
    );

    expect(revoked.revokedAt).toBeDefined();
  });

  test("rejects repeated revoke", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const created = await createToken(ctx);
    await call(apiTokenRoutes.revoke, { id: created.id }, { context: ctx });

    await expect(
      call(apiTokenRoutes.revoke, { id: created.id }, { context: ctx }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("throws NOT_FOUND for missing token", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    await expect(
      call(
        apiTokenRoutes.get,
        { id: "00000000-0000-0000-0000-000000000000" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("throws NOT_FOUND for missing update and revoke", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    await expect(
      call(
        apiTokenRoutes.update,
        { id: "00000000-0000-0000-0000-000000000000", data: { name: "Nope" } },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      call(
        apiTokenRoutes.revoke,
        { id: "00000000-0000-0000-0000-000000000000" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("scopes tokens to the org (RLS)", async () => {
    const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
    const { org: org2, user: user2 } = await createOrg(db, { name: "Org 2" });
    const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
    const ctx2 = createTestContext({ orgId: org2.id, userId: user2.id });

    await createToken(ctx1);
    await createToken(ctx2);

    const result = await call(
      apiTokenRoutes.list,
      { limit: 10 },
      { context: ctx1 },
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.orgId).toBe(org1.id);
  });

  test("requires admin role", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });

    await expect(
      call(apiTokenRoutes.list, { limit: 10 }, { context: ctx }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
