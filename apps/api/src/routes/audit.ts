// oRPC routes for audit log queries
// Read-only endpoint to list and filter audit events

import { z } from "zod";
import { eq, and, gt, gte, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { auditEvents, users } from "@scheduling/db/schema";
import { listAuditEventsQuerySchema } from "@scheduling/dto";
import { adminOnly } from "./base.js";
import { withOrg } from "../lib/db.js";

const idInput = z.object({ id: z.string().uuid() });

// ============================================================================
// LIST AUDIT EVENTS
// ============================================================================

export const list = adminOnly
  .input(listAuditEventsQuerySchema)
  .handler(async ({ input, context }) => {
    const {
      cursor,
      limit,
      entityType,
      entityId,
      actorId,
      action,
      startDate,
      endDate,
    } = input;
    const { orgId } = context;

    const results = await withOrg(orgId, async (tx) => {
      // Build conditions array
      const conditions: ReturnType<typeof eq>[] = [];

      if (cursor) {
        conditions.push(gt(auditEvents.id, cursor));
      }

      if (entityType) {
        conditions.push(eq(auditEvents.entityType, entityType));
      }

      if (entityId) {
        conditions.push(eq(auditEvents.entityId, entityId));
      }

      if (actorId) {
        conditions.push(eq(auditEvents.actorId, actorId));
      }

      if (action) {
        conditions.push(eq(auditEvents.action, action));
      }

      if (startDate) {
        const startDateTime = DateTime.fromISO(startDate)
          .startOf("day")
          .toJSDate();
        conditions.push(gte(auditEvents.createdAt, startDateTime));
      }

      if (endDate) {
        const endDateTime = DateTime.fromISO(endDate).endOf("day").toJSDate();
        conditions.push(lte(auditEvents.createdAt, endDateTime));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      return tx
        .select({
          auditEvent: auditEvents,
          actor: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(auditEvents)
        .leftJoin(users, eq(auditEvents.actorId, users.id))
        .where(whereClause)
        .limit(limit + 1)
        .orderBy(auditEvents.id);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    // Transform to response format
    const transformedItems = items.map((row) => ({
      ...row.auditEvent,
      actor: row.actor ?? undefined,
    }));

    return {
      items: transformedItems,
      nextCursor: hasMore
        ? (items[items.length - 1]?.auditEvent.id ?? null)
        : null,
      hasMore,
    };
  });

// ============================================================================
// GET SINGLE AUDIT EVENT
// ============================================================================

export const get = adminOnly
  .input(idInput)
  .handler(async ({ input, context }) => {
    const { id } = input;
    const { orgId } = context;

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select({
          auditEvent: auditEvents,
          actor: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(auditEvents)
        .leftJoin(users, eq(auditEvents.actorId, users.id))
        .where(eq(auditEvents.id, id))
        .limit(1);
    });

    if (results.length === 0) {
      return null;
    }

    const row = results[0]!;
    return {
      ...row.auditEvent,
      actor: row.actor ?? undefined,
    };
  });

// ============================================================================
// ROUTE EXPORTS
// ============================================================================

export const auditRoutes = {
  list,
  get,
};
