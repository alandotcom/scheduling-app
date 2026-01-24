import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db";
import {
  createResourceSchema,
  updateResourceSchema,
  paginationSchema,
} from "../schemas";

const resources = new Hono();

// List resources
resources.get("/", zValidator("query", paginationSchema), async (c) => {
  const { page, per_page } = c.req.valid("query");
  const offset = (page - 1) * per_page;

  const [rows, countResult] = await Promise.all([
    sql`
      SELECT r.id, r.org_id, r.location_id, r.name, r.description, r.quantity,
             r.is_active, r.metadata, r.created_at, r.updated_at,
             l.name as location_name
      FROM resources r
      LEFT JOIN locations l ON l.id = r.location_id AND l.deleted_at IS NULL
      WHERE r.deleted_at IS NULL
      ORDER BY r.name ASC
      LIMIT ${per_page} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM resources
      WHERE deleted_at IS NULL
    `,
  ]);

  return c.json({
    data: rows,
    meta: { page, per_page, total: countResult[0]?.total ?? 0 },
  });
});

// Create resource
resources.post("/", zValidator("json", createResourceSchema), async (c) => {
  const body = c.req.valid("json");
  const session = c.get("session");
  const orgId = session.activeOrg?.id ?? c.get("auth")?.orgId;

  if (!orgId) {
    return c.json(
      { error: { code: "no_org_context", message: "No organization context" } },
      400
    );
  }

  // Validate location_id if provided
  if (body.location_id) {
    const location = await sql`
      SELECT id FROM locations WHERE id = ${body.location_id} AND deleted_at IS NULL
    `;
    if (location.length === 0) {
      return c.json(
        { error: { code: "invalid_location", message: "Location not found" } },
        400
      );
    }
  }

  const result = await sql`
    INSERT INTO resources (org_id, location_id, name, description, quantity, is_active, metadata)
    VALUES (
      ${orgId},
      ${body.location_id ?? null},
      ${body.name},
      ${body.description ?? null},
      ${body.quantity},
      ${body.is_active},
      ${JSON.stringify(body.metadata)}
    )
    RETURNING id, org_id, location_id, name, description, quantity, is_active, metadata, created_at, updated_at
  `;

  return c.json({ data: result[0] }, 201);
});

// Get resource by ID
resources.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    SELECT r.id, r.org_id, r.location_id, r.name, r.description, r.quantity,
           r.is_active, r.metadata, r.created_at, r.updated_at,
           l.name as location_name
    FROM resources r
    LEFT JOIN locations l ON l.id = r.location_id AND l.deleted_at IS NULL
    WHERE r.id = ${id} AND r.deleted_at IS NULL
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Resource not found" } },
      404
    );
  }

  return c.json({ data: result[0] });
});

// Update resource
resources.patch("/:id", zValidator("json", updateResourceSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Check if resource exists
  const existing = await sql`
    SELECT id FROM resources WHERE id = ${id} AND deleted_at IS NULL
  `;

  if (existing.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Resource not found" } },
      404
    );
  }

  // Validate location_id if provided
  if (body.location_id) {
    const location = await sql`
      SELECT id FROM locations WHERE id = ${body.location_id} AND deleted_at IS NULL
    `;
    if (location.length === 0) {
      return c.json(
        { error: { code: "invalid_location", message: "Location not found" } },
        400
      );
    }
  }

  const result = await sql`
    UPDATE resources
    SET
      name = COALESCE(${body.name ?? null}, name),
      description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
      location_id = CASE WHEN ${body.location_id !== undefined} THEN ${body.location_id ?? null} ELSE location_id END,
      quantity = COALESCE(${body.quantity ?? null}, quantity),
      is_active = COALESCE(${body.is_active ?? null}, is_active),
      metadata = COALESCE(${body.metadata ? JSON.stringify(body.metadata) : null}::jsonb, metadata),
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, org_id, location_id, name, description, quantity, is_active, metadata, created_at, updated_at
  `;

  return c.json({ data: result[0] });
});

// Delete resource (soft delete)
resources.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    UPDATE resources
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Resource not found" } },
      404
    );
  }

  return c.json({ data: { id, deleted: true } });
});

export default resources;
