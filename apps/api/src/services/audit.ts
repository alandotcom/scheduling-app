// Audit logging service for tracking changes to entities
// Records actor, action, entity type/id, and before/after snapshots

import { auditEvents } from "@scheduling/db/schema";
import type { DbClient } from "../lib/db.js";
import { withOrg } from "../lib/db.js";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "confirm"
  | "cancel"
  | "reschedule"
  | "no_show";
export type AuditActorType = "user" | "api_token" | "system";
export type AuditEntityType =
  | "appointment"
  | "calendar"
  | "location"
  | "resource"
  | "appointment_type"
  | "client";

export interface AuditContext {
  orgId: string;
  actorId: string | null;
  actorType: AuditActorType;
  metadata?: Record<string, unknown>;
}

export interface AuditEntry {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Record an audit event
 * Can be called within or outside a transaction
 */
export async function recordAudit(
  context: AuditContext,
  entry: AuditEntry,
  tx?: DbClient,
): Promise<void> {
  const { orgId, actorId, actorType, metadata } = context;
  const { action, entityType, entityId, before, after } = entry;

  const insertFn = async (database: DbClient) => {
    await database.insert(auditEvents).values({
      orgId,
      actorId,
      actorType,
      action,
      entityType,
      entityId,
      before: before ?? null,
      after: after ?? null,
      metadata: metadata ?? null,
    });
  };

  if (tx) {
    await insertFn(tx);
  } else {
    await withOrg(orgId, insertFn);
  }
}

/**
 * Convert a database row to a serializable snapshot for audit logging
 * Converts Date objects to ISO strings
 */
export function toAuditSnapshot<T extends object>(
  entity: T | null | undefined,
): Record<string, unknown> | null {
  if (!entity) return null;

  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (value instanceof Date) {
      snapshot[key] = value.toISOString();
    } else if (value === undefined) {
      snapshot[key] = null;
    } else {
      snapshot[key] = value;
    }
  }
  return snapshot;
}

/**
 * Create an audit context from request context
 */
export function createAuditContext(
  orgId: string,
  userId: string | null,
  authMethod: "session" | "api_token" | "none",
  metadata?: Record<string, unknown>,
): AuditContext {
  let actorType: AuditActorType;
  if (authMethod === "api_token") {
    actorType = "api_token";
  } else if (authMethod === "session" && userId) {
    actorType = "user";
  } else {
    actorType = "system";
  }

  const context: AuditContext = {
    orgId,
    actorId: userId,
    actorType,
  };

  if (metadata !== undefined) {
    context.metadata = metadata;
  }

  return context;
}
