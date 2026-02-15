// Integration tests for audit routes

import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import {
  createTestContext,
  createOrg,
  createOrgMember,
  getTestDb,
  setTestOrgContext,
  clearTestOrgContext,
} from "../test-utils/index.js";
import * as auditRoutes from "./audit.js";
import { auditEvents } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Audit Routes", () => {
  const db = getTestDb() as Database;

  async function insertAuditEvent(options: {
    orgId: string;
    actorId: string | null;
    action?:
      | "create"
      | "update"
      | "delete"
      | "cancel"
      | "reschedule"
      | "no_show";
    entityType?:
      | "appointment"
      | "calendar"
      | "location"
      | "resource"
      | "appointment_type"
      | "client";
    entityId?: string;
    createdAt: Date;
  }) {
    await setTestOrgContext(db, options.orgId);
    try {
      const [event] = await db
        .insert(auditEvents)
        .values({
          orgId: options.orgId,
          actorId: options.actorId,
          actorType: options.actorId ? "user" : "system",
          action: options.action ?? "create",
          entityType: options.entityType ?? "appointment",
          entityId: options.entityId ?? randomUUID(),
          before: null,
          after: null,
          metadata: null,
          createdAt: options.createdAt,
          updatedAt: options.createdAt,
        })
        .returning();

      return event!;
    } finally {
      await clearTestOrgContext(db);
    }
  }

  test("lists events with pagination and actor details", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const event1 = await insertAuditEvent({
      orgId: org.id,
      actorId: user.id,
      action: "create",
      entityType: "appointment",
      createdAt: DateTime.local(2026, 1, 15, 10, 0).toJSDate(),
    });
    await insertAuditEvent({
      orgId: org.id,
      actorId: user.id,
      action: "update",
      entityType: "calendar",
      createdAt: DateTime.local(2026, 1, 16, 12, 0).toJSDate(),
    });
    await insertAuditEvent({
      orgId: org.id,
      actorId: user.id,
      action: "delete",
      entityType: "client",
      createdAt: DateTime.local(2026, 1, 17, 9, 0).toJSDate(),
    });

    const first = await call(auditRoutes.list, { limit: 2 }, { context: ctx });

    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeDefined();
    expect(first.items[0]!.actor?.email).toBe(user.email);

    const second = await call(
      auditRoutes.list,
      { limit: 2, cursor: first.nextCursor! },
      { context: ctx },
    );

    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);

    const fetched = await call(
      auditRoutes.get,
      { id: event1.id },
      { context: ctx },
    );

    expect(fetched?.id).toBe(event1.id);
  });

  test("filters by entity type, action, actor, and date range", async () => {
    const { org, user } = await createOrg(db);
    const otherUser = await createOrgMember(db, org.id, {
      email: "member@example.com",
      name: "Member User",
      role: "member",
    });
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const day1 = DateTime.local(2026, 2, 1, 9, 0).toJSDate();
    const day2 = DateTime.local(2026, 2, 2, 10, 0).toJSDate();
    const day3 = DateTime.local(2026, 2, 3, 11, 0).toJSDate();

    await insertAuditEvent({
      orgId: org.id,
      actorId: user.id,
      action: "create",
      entityType: "appointment",
      entityId: randomUUID(),
      createdAt: day1,
    });
    const event2 = await insertAuditEvent({
      orgId: org.id,
      actorId: otherUser.id,
      action: "update",
      entityType: "calendar",
      entityId: randomUUID(),
      createdAt: day2,
    });
    const event3 = await insertAuditEvent({
      orgId: org.id,
      actorId: user.id,
      action: "update",
      entityType: "appointment",
      entityId: randomUUID(),
      createdAt: day3,
    });

    const byEntity = await call(
      auditRoutes.list,
      { limit: 10, entityType: "appointment", action: "update" },
      { context: ctx },
    );

    expect(byEntity.items).toHaveLength(1);
    expect(byEntity.items[0]!.id).toBe(event3.id);

    const byEntityId = await call(
      auditRoutes.list,
      { limit: 10, entityId: event3.entityId },
      { context: ctx },
    );

    expect(byEntityId.items).toHaveLength(1);
    expect(byEntityId.items[0]!.id).toBe(event3.id);

    const byActor = await call(
      auditRoutes.list,
      { limit: 10, actorId: otherUser.id },
      { context: ctx },
    );

    expect(byActor.items).toHaveLength(1);
    expect(byActor.items[0]!.id).toBe(event2.id);

    const date = DateTime.fromJSDate(day1).toISODate()!;
    const byDate = await call(
      auditRoutes.list,
      { limit: 10, startDate: date, endDate: date },
      { context: ctx },
    );

    expect(byDate.items).toHaveLength(1);
    expect(byDate.items[0]!.action).toBe("create");
  });

  test("returns null actor for system audit events", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const event = await insertAuditEvent({
      orgId: org.id,
      actorId: null,
      action: "create",
      entityType: "appointment",
      createdAt: DateTime.local(2026, 3, 1, 9, 0).toJSDate(),
    });

    const listed = await call(
      auditRoutes.list,
      { limit: 10 },
      { context: ctx },
    );

    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]!.id).toBe(event.id);
    expect(listed.items[0]!.actor).toBeNull();

    const fetched = await call(
      auditRoutes.get,
      { id: event.id },
      { context: ctx },
    );

    expect(fetched?.actor).toBeNull();
  });

  test("returns null for missing audit events", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const result = await call(
      auditRoutes.get,
      { id: "00000000-0000-0000-0000-000000000000" },
      { context: ctx },
    );

    expect(result).toBeNull();
  });

  test("requires admin role", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "member",
    });

    await expect(
      call(auditRoutes.list, { limit: 10 }, { context: ctx }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
