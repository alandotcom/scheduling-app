import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db";
import {
  createCalendarSchema,
  updateCalendarSchema,
  paginationSchema,
} from "../schemas";

const calendars = new Hono();

// List calendars
calendars.get("/", zValidator("query", paginationSchema), async (c) => {
  const { page, per_page } = c.req.valid("query");
  const offset = (page - 1) * per_page;

  const [rows, countResult] = await Promise.all([
    sql`
      SELECT c.id, c.org_id, c.location_id, c.name, c.description, c.timezone,
             c.is_active, c.metadata, c.created_at, c.updated_at,
             l.name as location_name
      FROM calendars c
      LEFT JOIN locations l ON l.id = c.location_id AND l.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      ORDER BY c.name ASC
      LIMIT ${per_page} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM calendars
      WHERE deleted_at IS NULL
    `,
  ]);

  return c.json({
    data: rows,
    meta: { page, per_page, total: countResult[0]?.total ?? 0 },
  });
});

// Create calendar
calendars.post("/", zValidator("json", createCalendarSchema), async (c) => {
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
    INSERT INTO calendars (org_id, location_id, name, description, timezone, is_active, metadata)
    VALUES (
      ${orgId},
      ${body.location_id ?? null},
      ${body.name},
      ${body.description ?? null},
      ${body.timezone},
      ${body.is_active},
      ${JSON.stringify(body.metadata)}
    )
    RETURNING id, org_id, location_id, name, description, timezone, is_active, metadata, created_at, updated_at
  `;

  return c.json({ data: result[0] }, 201);
});

// Get calendar by ID
calendars.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    SELECT c.id, c.org_id, c.location_id, c.name, c.description, c.timezone,
           c.is_active, c.metadata, c.created_at, c.updated_at,
           l.name as location_name
    FROM calendars c
    LEFT JOIN locations l ON l.id = c.location_id AND l.deleted_at IS NULL
    WHERE c.id = ${id} AND c.deleted_at IS NULL
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Calendar not found" } },
      404
    );
  }

  return c.json({ data: result[0] });
});

// Update calendar
calendars.patch("/:id", zValidator("json", updateCalendarSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Check if calendar exists
  const existing = await sql`
    SELECT id FROM calendars WHERE id = ${id} AND deleted_at IS NULL
  `;

  if (existing.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Calendar not found" } },
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
    UPDATE calendars
    SET
      name = COALESCE(${body.name ?? null}, name),
      description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
      location_id = CASE WHEN ${body.location_id !== undefined} THEN ${body.location_id ?? null} ELSE location_id END,
      timezone = COALESCE(${body.timezone ?? null}, timezone),
      is_active = COALESCE(${body.is_active ?? null}, is_active),
      metadata = COALESCE(${body.metadata ? JSON.stringify(body.metadata) : null}::jsonb, metadata),
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id, org_id, location_id, name, description, timezone, is_active, metadata, created_at, updated_at
  `;

  return c.json({ data: result[0] });
});

// Delete calendar (soft delete)
calendars.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    UPDATE calendars
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Calendar not found" } },
      404
    );
  }

  return c.json({ data: { id, deleted: true } });
});

export default calendars;
