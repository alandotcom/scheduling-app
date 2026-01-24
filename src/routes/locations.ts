import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db";
import {
  createLocationSchema,
  updateLocationSchema,
  paginationSchema,
} from "../schemas";

const locations = new Hono();

// List locations
locations.get("/", zValidator("query", paginationSchema), async (c) => {
  const { page, per_page } = c.req.valid("query");
  const offset = (page - 1) * per_page;

  const [rows, countResult] = await Promise.all([
    sql`
      SELECT id, org_id, name, address, timezone, metadata, created_at, updated_at
      FROM locations
      WHERE deleted_at IS NULL
      ORDER BY name ASC
      LIMIT ${per_page} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM locations
      WHERE deleted_at IS NULL
    `,
  ]);

  const total = countResult[0]?.total ?? 0;

  return c.json({
    data: rows,
    meta: { page, per_page, total },
  });
});

// Create location
locations.post("/", zValidator("json", createLocationSchema), async (c) => {
  const body = c.req.valid("json");
  const session = c.get("session");
  const orgId = session.activeOrg?.id ?? c.get("auth")?.orgId;

  if (!orgId) {
    return c.json(
      { error: { code: "no_org_context", message: "No organization context" } },
      400
    );
  }

  const result = await sql`
    INSERT INTO locations (org_id, name, address, timezone, metadata)
    VALUES (${orgId}, ${body.name}, ${body.address ?? null}, ${body.timezone}, ${JSON.stringify(body.metadata)})
    RETURNING id, org_id, name, address, timezone, metadata, created_at, updated_at
  `;

  return c.json({ data: result[0] }, 201);
});

// Get location by ID
locations.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    SELECT id, org_id, name, address, timezone, metadata, created_at, updated_at
    FROM locations
    WHERE id = ${id} AND deleted_at IS NULL
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Location not found" } },
      404
    );
  }

  return c.json({ data: result[0] });
});

// Update location
locations.patch("/:id", zValidator("json", updateLocationSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Check if location exists
  const existing = await sql`
    SELECT id FROM locations WHERE id = ${id} AND deleted_at IS NULL
  `;

  if (existing.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Location not found" } },
      404
    );
  }

  // Build update fields dynamically
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.address !== undefined) updates.address = body.address;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.metadata !== undefined) updates.metadata = JSON.stringify(body.metadata);

  if (Object.keys(updates).length === 0) {
    const result = await sql`
      SELECT id, org_id, name, address, timezone, metadata, created_at, updated_at
      FROM locations WHERE id = ${id}
    `;
    return c.json({ data: result[0] });
  }

  // Perform update with dynamic fields
  const result = await sql`
    UPDATE locations
    SET
      name = COALESCE(${updates.name ?? null}, name),
      address = CASE WHEN ${body.address !== undefined} THEN ${updates.address ?? null} ELSE address END,
      timezone = COALESCE(${updates.timezone ?? null}, timezone),
      metadata = COALESCE(${updates.metadata ?? null}::jsonb, metadata),
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, org_id, name, address, timezone, metadata, created_at, updated_at
  `;

  return c.json({ data: result[0] });
});

// Delete location (soft delete)
locations.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    UPDATE locations
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Location not found" } },
      404
    );
  }

  return c.json({ data: { id, deleted: true } });
});

export default locations;
