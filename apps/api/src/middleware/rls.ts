// RLS middleware - sets org and user context for row-level security

import { createMiddleware } from "hono/factory";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";

export const rlsMiddleware = createMiddleware(async (c, next) => {
  const orgId = c.get("orgId");
  const userId = c.get("userId");

  // Set RLS context for both org and user
  // Note: For full connection pooling safety, use SET LOCAL within transactions
  // or wrap queries with withOrg() helper from lib/db.ts
  const setConfigs: Promise<unknown>[] = [];

  if (orgId) {
    setConfigs.push(
      db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, false)`),
    );
  }

  if (userId) {
    setConfigs.push(
      db.execute(
        sql`SELECT set_config('app.current_user_id', ${userId}, false)`,
      ),
    );
  }

  if (setConfigs.length > 0) {
    await Promise.all(setConfigs);
  }

  try {
    await next();
  } finally {
    // Reset the context after the request
    const resetConfigs: Promise<unknown>[] = [];
    if (orgId) {
      resetConfigs.push(
        db.execute(sql`SELECT set_config('app.current_org_id', '', false)`),
      );
    }
    if (userId) {
      resetConfigs.push(
        db.execute(sql`SELECT set_config('app.current_user_id', '', false)`),
      );
    }
    if (resetConfigs.length > 0) {
      await Promise.all(resetConfigs);
    }
  }
});
