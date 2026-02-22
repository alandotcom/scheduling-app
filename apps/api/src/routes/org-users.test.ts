import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import { and, eq } from "drizzle-orm";
import { orgMemberships, users } from "@scheduling/db/schema";
import {
  createOrg,
  createOrgMember,
  createTestContext,
  createTokenContext,
  getTestDb,
  registerDbTestReset,
} from "../test-utils/index.js";
import { orgUserRoutes } from "./org-users.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Org User Routes", () => {
  registerDbTestReset();
  const db = getTestDb() as Database;

  test("list returns members for active organization only", async () => {
    const { org, user: owner } = await createOrg(db, {
      name: "Org A",
      email: "owner-a@example.com",
    });
    await createOrgMember(db, org.id, {
      email: "member-a@example.com",
      role: "member",
    });

    const { org: otherOrg } = await createOrg(db, {
      name: "Org B",
      email: "owner-b@example.com",
    });
    await createOrgMember(db, otherOrg.id, {
      email: "member-b@example.com",
      role: "member",
    });

    const ctx = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

    const result = await call(orgUserRoutes.list, undefined as never, {
      context: ctx,
    });

    expect(result.length).toBe(2);
    expect(result.every((item) => item.orgId === org.id)).toBe(true);
    expect(result.find((item) => item.email === "member-b@example.com")).toBe(
      undefined,
    );
  });

  test("create creates a new user and membership", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });
    const ctx = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

    const created = await call(
      orgUserRoutes.create,
      {
        email: "new-user@example.com",
        name: "New User",
        role: "member",
      },
      { context: ctx },
    );

    expect(created.email).toBe("new-user@example.com");
    expect(created.role).toBe("member");

    const [membership] = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, org.id),
          eq(orgMemberships.userId, created.userId),
        ),
      )
      .limit(1);

    expect(membership).toBeDefined();
    expect(membership?.role).toBe("member");
  });

  test("create reuses existing user and adds org membership", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });

    const [existingUser] = await db
      .insert(users)
      .values({
        email: "existing@example.com",
        name: "Existing User",
        emailVerified: true,
      })
      .returning();

    const ctx = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

    const created = await call(
      orgUserRoutes.create,
      {
        email: "existing@example.com",
        role: "admin",
      },
      { context: ctx },
    );

    expect(created.userId).toBe(existingUser!.id);
    expect(created.role).toBe("admin");

    const [membership] = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, org.id),
          eq(orgMemberships.userId, existingUser!.id),
        ),
      )
      .limit(1);

    expect(membership).toBeDefined();
    expect(membership?.role).toBe("admin");
  });

  test("updateRole prevents admin from assigning owner", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });
    const adminUser = await createOrgMember(db, org.id, {
      email: "admin@example.com",
      role: "admin",
    });
    const memberUser = await createOrgMember(db, org.id, {
      email: "member@example.com",
      role: "member",
    });

    const ctx = createTestContext({
      orgId: org.id,
      userId: adminUser.id,
      role: "admin",
    });

    await expect(
      call(
        orgUserRoutes.updateRole,
        { userId: memberUser.id, role: "owner" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const [targetMembership] = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.orgId, org.id),
          eq(orgMemberships.userId, memberUser.id),
        ),
      )
      .limit(1);

    expect(targetMembership?.role).toBe("member");
    expect(owner.id).toBeDefined();
  });

  test("updateRole blocks demoting the last owner", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });
    const ctx = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

    await expect(
      call(
        orgUserRoutes.updateRole,
        { userId: owner.id, role: "admin" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("updateRole updates non-owner role successfully", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });
    const memberUser = await createOrgMember(db, org.id, {
      email: "member@example.com",
      role: "member",
    });

    const ctx = createTestContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
    });

    const updated = await call(
      orgUserRoutes.updateRole,
      { userId: memberUser.id, role: "admin" },
      { context: ctx },
    );

    expect(updated.userId).toBe(memberUser.id);
    expect(updated.role).toBe("admin");
  });

  test("token-authenticated admin cannot create users", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });
    const tokenCtx = createTokenContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
      tokenId: "token-1",
    });

    await expect(
      call(
        orgUserRoutes.create,
        {
          email: "token-create@example.com",
          name: "Token Create",
          role: "member",
        },
        { context: tokenCtx },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("token-authenticated admin cannot update membership role", async () => {
    const { org, user: owner } = await createOrg(db, {
      email: "owner@example.com",
    });
    const memberUser = await createOrgMember(db, org.id, {
      email: "member@example.com",
      role: "member",
    });
    const tokenCtx = createTokenContext({
      orgId: org.id,
      userId: owner.id,
      role: "owner",
      tokenId: "token-2",
    });

    await expect(
      call(
        orgUserRoutes.updateRole,
        { userId: memberUser.id, role: "admin" },
        { context: tokenCtx },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
