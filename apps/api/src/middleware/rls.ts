// RLS middleware - sets org context for row-level security

import { createMiddleware } from "hono/factory";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";

export const rlsMiddleware = createMiddleware(async (c, next) => {
  const orgId = c.get("orgId");

  if (!orgId) {
    // No org context - RLS will block all rows (safe default)
    return next();
  }

  // Set the RLS context for this connection
  // Note: For full connection pooling safety, use SET LOCAL within transactions
  // or wrap queries with withOrg() helper from lib/db.ts
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, false)`,
  );

  try {
    await next();
  } finally {
    // Reset the context after the request
    await db.execute(sql`SELECT set_config('app.current_org_id', '', false)`);
  }
});
