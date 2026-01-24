import { Hono } from "hono";
import { auth } from "./auth/config";
import { bearerAuth } from "./middleware/bearer-auth";
import { sessionAuth } from "./middleware/session-auth";
import { sql } from "./db";
import locations from "./routes/locations";
import calendars from "./routes/calendars";
import resources from "./routes/resources";
import appointmentTypes from "./routes/appointment-types";

const app = new Hono();

// Public routes (no auth)
app.get("/v1/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Mount BetterAuth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Protected routes with session OR token auth
const api = new Hono();
api.use("*", sessionAuth({ allowToken: true }));

// Get current user and active org
api.get("/me", (c) => {
  const session = c.get("session");
  return c.json({
    user: session.user,
    activeOrg: session.activeOrg,
  });
});

// List user's organizations (doesn't require active org)
const orgsApi = new Hono();
orgsApi.use("*", sessionAuth({ allowToken: true, requireOrg: false }));

orgsApi.get("/", async (c) => {
  const session = c.get("session");

  const memberships = await sql`
    SELECT om.org_id as id, o.name, o.slug, om.role, om.is_default
    FROM org_memberships om
    JOIN orgs o ON o.id = om.org_id
    WHERE om.user_id = ${session.user.id}
    ORDER BY om.is_default DESC, o.name ASC
  `;

  return c.json({
    orgs: memberships.map((m: any) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      role: m.role,
      isDefault: m.is_default,
    })),
  });
});

// Activate (switch to) an organization
orgsApi.post("/:id/activate", async (c) => {
  const session = c.get("session");
  const orgId = c.req.param("id");

  // Verify user has access to this org
  const membership = await sql`
    SELECT om.org_id, om.role, o.name
    FROM org_memberships om
    JOIN orgs o ON o.id = om.org_id
    WHERE om.user_id = ${session.user.id}
      AND om.org_id = ${orgId}
  `;

  if (membership.length === 0) {
    return c.json(
      {
        error: {
          code: "no_org_access",
          message: "You do not have access to this organization",
        },
      },
      403
    );
  }

  // Update session with new active org
  await sql`
    UPDATE session
    SET active_org_id = ${orgId}, updated_at = NOW()
    WHERE id = ${session.session.id}
  `;

  const org = membership[0];
  return c.json({
    activeOrg: {
      id: org.org_id,
      name: org.name,
      role: org.role,
    },
  });
});

app.route("/v1/orgs", orgsApi);

// Legacy appointments endpoint (bearer auth only for backwards compat)
api.get("/appointments", (c) => {
  const session = c.get("session");
  // orgId is set via RLS, scope is from session
  return c.json({
    appointments: [],
    activeOrg: session.activeOrg,
  });
});

// Mount CRUD routes for core entities
api.route("/locations", locations);
api.route("/calendars", calendars);
api.route("/resources", resources);
api.route("/appointment-types", appointmentTypes);

app.route("/v1", api);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

console.log(`Server starting on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
