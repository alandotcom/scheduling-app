import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db";
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
  assignCalendarSchema,
  assignResourceSchema,
  paginationSchema,
} from "../schemas";

const appointmentTypes = new Hono();

// List appointment types
appointmentTypes.get("/", zValidator("query", paginationSchema), async (c) => {
  const { page, per_page } = c.req.valid("query");
  const offset = (page - 1) * per_page;

  const [rows, countResult] = await Promise.all([
    sql`
      SELECT at.id, at.org_id, at.name, at.description, at.duration_min,
             at.padding_before_min, at.padding_after_min, at.capacity,
             at.price_cents, at.color, at.is_active, at.metadata,
             at.created_at, at.updated_at
      FROM appointment_types at
      WHERE at.deleted_at IS NULL
      ORDER BY at.name ASC
      LIMIT ${per_page} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int as total
      FROM appointment_types
      WHERE deleted_at IS NULL
    `,
  ]);

  // Fetch calendar associations for each appointment type
  const typeIds = rows.map((r: { id: string }) => r.id);
  const calendarAssocs =
    typeIds.length > 0
      ? await sql`
        SELECT atc.appointment_type_id, c.id as calendar_id, c.name as calendar_name
        FROM appointment_type_calendars atc
        JOIN calendars c ON c.id = atc.calendar_id AND c.deleted_at IS NULL
        WHERE atc.appointment_type_id = ANY(${typeIds})
      `
      : [];

  // Fetch resource requirements for each appointment type
  const resourceAssocs =
    typeIds.length > 0
      ? await sql`
        SELECT atr.appointment_type_id, r.id as resource_id, r.name as resource_name, atr.quantity_required
        FROM appointment_type_resources atr
        JOIN resources r ON r.id = atr.resource_id AND r.deleted_at IS NULL
        WHERE atr.appointment_type_id = ANY(${typeIds})
      `
      : [];

  // Group associations by appointment type
  const calendarsByType = new Map<
    string,
    { id: string; name: string }[]
  >();
  for (const assoc of calendarAssocs as {
    appointment_type_id: string;
    calendar_id: string;
    calendar_name: string;
  }[]) {
    const existing = calendarsByType.get(assoc.appointment_type_id) || [];
    existing.push({ id: assoc.calendar_id, name: assoc.calendar_name });
    calendarsByType.set(assoc.appointment_type_id, existing);
  }

  const resourcesByType = new Map<
    string,
    { id: string; name: string; quantity_required: number }[]
  >();
  for (const assoc of resourceAssocs as {
    appointment_type_id: string;
    resource_id: string;
    resource_name: string;
    quantity_required: number;
  }[]) {
    const existing = resourcesByType.get(assoc.appointment_type_id) || [];
    existing.push({
      id: assoc.resource_id,
      name: assoc.resource_name,
      quantity_required: assoc.quantity_required,
    });
    resourcesByType.set(assoc.appointment_type_id, existing);
  }

  const data = rows.map((row: { id: string }) => ({
    ...row,
    calendars: calendarsByType.get(row.id) || [],
    resources: resourcesByType.get(row.id) || [],
  }));

  return c.json({
    data,
    meta: { page, per_page, total: countResult[0]?.total ?? 0 },
  });
});

// Create appointment type
appointmentTypes.post(
  "/",
  zValidator("json", createAppointmentTypeSchema),
  async (c) => {
    const body = c.req.valid("json");
    const session = c.get("session");
    const orgId = session.activeOrg?.id ?? c.get("auth")?.orgId;

    if (!orgId) {
      return c.json(
        {
          error: { code: "no_org_context", message: "No organization context" },
        },
        400
      );
    }

    // Start transaction for creating type and associations
    const result = await sql.begin(async (tx) => {
      const [appointmentType] = await tx`
        INSERT INTO appointment_types (
          org_id, name, description, duration_min, padding_before_min,
          padding_after_min, capacity, price_cents, color, is_active, metadata
        )
        VALUES (
          ${orgId},
          ${body.name},
          ${body.description ?? null},
          ${body.duration_min},
          ${body.padding_before_min},
          ${body.padding_after_min},
          ${body.capacity},
          ${body.price_cents ?? null},
          ${body.color ?? null},
          ${body.is_active},
          ${JSON.stringify(body.metadata)}
        )
        RETURNING id, org_id, name, description, duration_min, padding_before_min,
                  padding_after_min, capacity, price_cents, color, is_active, metadata,
                  created_at, updated_at
      `;

      // Create calendar associations if provided
      if (body.calendar_ids && body.calendar_ids.length > 0) {
        // Validate calendar IDs
        const validCalendars = await tx`
          SELECT id FROM calendars WHERE id = ANY(${body.calendar_ids}) AND deleted_at IS NULL
        `;
        const validIds = new Set(validCalendars.map((c: { id: string }) => c.id));
        const invalidIds = body.calendar_ids.filter(
          (id: string) => !validIds.has(id)
        );

        if (invalidIds.length > 0) {
          throw new Error(`Invalid calendar IDs: ${invalidIds.join(", ")}`);
        }

        // Insert associations
        for (const calendarId of body.calendar_ids) {
          await tx`
            INSERT INTO appointment_type_calendars (appointment_type_id, calendar_id)
            VALUES (${appointmentType.id}, ${calendarId})
          `;
        }
      }

      return appointmentType;
    });

    return c.json({ data: result }, 201);
  }
);

// Get appointment type by ID
appointmentTypes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    SELECT at.id, at.org_id, at.name, at.description, at.duration_min,
           at.padding_before_min, at.padding_after_min, at.capacity,
           at.price_cents, at.color, at.is_active, at.metadata,
           at.created_at, at.updated_at
    FROM appointment_types at
    WHERE at.id = ${id} AND at.deleted_at IS NULL
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Appointment type not found" } },
      404
    );
  }

  // Fetch calendar associations
  const calendars = await sql`
    SELECT c.id, c.name
    FROM appointment_type_calendars atc
    JOIN calendars c ON c.id = atc.calendar_id AND c.deleted_at IS NULL
    WHERE atc.appointment_type_id = ${id}
  `;

  // Fetch resource requirements
  const resources = await sql`
    SELECT r.id, r.name, atr.quantity_required
    FROM appointment_type_resources atr
    JOIN resources r ON r.id = atr.resource_id AND r.deleted_at IS NULL
    WHERE atr.appointment_type_id = ${id}
  `;

  return c.json({
    data: {
      ...result[0],
      calendars,
      resources,
    },
  });
});

// Update appointment type
appointmentTypes.patch(
  "/:id",
  zValidator("json", updateAppointmentTypeSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    // Check if appointment type exists
    const existing = await sql`
      SELECT id FROM appointment_types WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (existing.length === 0) {
      return c.json(
        { error: { code: "not_found", message: "Appointment type not found" } },
        404
      );
    }

    const result = await sql`
      UPDATE appointment_types
      SET
        name = COALESCE(${body.name ?? null}, name),
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        duration_min = COALESCE(${body.duration_min ?? null}, duration_min),
        padding_before_min = COALESCE(${body.padding_before_min ?? null}, padding_before_min),
        padding_after_min = COALESCE(${body.padding_after_min ?? null}, padding_after_min),
        capacity = COALESCE(${body.capacity ?? null}, capacity),
        price_cents = CASE WHEN ${body.price_cents !== undefined} THEN ${body.price_cents ?? null} ELSE price_cents END,
        color = CASE WHEN ${body.color !== undefined} THEN ${body.color ?? null} ELSE color END,
        is_active = COALESCE(${body.is_active ?? null}, is_active),
        metadata = COALESCE(${body.metadata ? JSON.stringify(body.metadata) : null}::jsonb, metadata),
        updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, org_id, name, description, duration_min, padding_before_min,
                padding_after_min, capacity, price_cents, color, is_active, metadata,
                created_at, updated_at
    `;

    return c.json({ data: result[0] });
  }
);

// Delete appointment type (soft delete)
appointmentTypes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await sql`
    UPDATE appointment_types
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Appointment type not found" } },
      404
    );
  }

  return c.json({ data: { id, deleted: true } });
});

// Assign calendar to appointment type
appointmentTypes.post(
  "/:id/calendars",
  zValidator("json", assignCalendarSchema),
  async (c) => {
    const id = c.req.param("id");
    const { calendar_id } = c.req.valid("json");

    // Check if appointment type exists
    const existing = await sql`
      SELECT id FROM appointment_types WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (existing.length === 0) {
      return c.json(
        { error: { code: "not_found", message: "Appointment type not found" } },
        404
      );
    }

    // Check if calendar exists
    const calendar = await sql`
      SELECT id FROM calendars WHERE id = ${calendar_id} AND deleted_at IS NULL
    `;

    if (calendar.length === 0) {
      return c.json(
        { error: { code: "invalid_calendar", message: "Calendar not found" } },
        400
      );
    }

    // Check for duplicate
    const duplicate = await sql`
      SELECT id FROM appointment_type_calendars
      WHERE appointment_type_id = ${id} AND calendar_id = ${calendar_id}
    `;

    if (duplicate.length > 0) {
      return c.json(
        {
          error: {
            code: "duplicate",
            message: "Calendar already assigned to this appointment type",
          },
        },
        409
      );
    }

    await sql`
      INSERT INTO appointment_type_calendars (appointment_type_id, calendar_id)
      VALUES (${id}, ${calendar_id})
    `;

    return c.json(
      { data: { appointment_type_id: id, calendar_id, assigned: true } },
      201
    );
  }
);

// Remove calendar from appointment type
appointmentTypes.delete("/:id/calendars/:calendarId", async (c) => {
  const id = c.req.param("id");
  const calendarId = c.req.param("calendarId");

  const result = await sql`
    DELETE FROM appointment_type_calendars
    WHERE appointment_type_id = ${id} AND calendar_id = ${calendarId}
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Association not found" } },
      404
    );
  }

  return c.json({
    data: { appointment_type_id: id, calendar_id: calendarId, removed: true },
  });
});

// Assign resource to appointment type
appointmentTypes.post(
  "/:id/resources",
  zValidator("json", assignResourceSchema),
  async (c) => {
    const id = c.req.param("id");
    const { resource_id, quantity_required } = c.req.valid("json");

    // Check if appointment type exists
    const existing = await sql`
      SELECT id FROM appointment_types WHERE id = ${id} AND deleted_at IS NULL
    `;

    if (existing.length === 0) {
      return c.json(
        { error: { code: "not_found", message: "Appointment type not found" } },
        404
      );
    }

    // Check if resource exists
    const resource = await sql`
      SELECT id FROM resources WHERE id = ${resource_id} AND deleted_at IS NULL
    `;

    if (resource.length === 0) {
      return c.json(
        { error: { code: "invalid_resource", message: "Resource not found" } },
        400
      );
    }

    // Check for duplicate
    const duplicate = await sql`
      SELECT id FROM appointment_type_resources
      WHERE appointment_type_id = ${id} AND resource_id = ${resource_id}
    `;

    if (duplicate.length > 0) {
      return c.json(
        {
          error: {
            code: "duplicate",
            message: "Resource already assigned to this appointment type",
          },
        },
        409
      );
    }

    await sql`
      INSERT INTO appointment_type_resources (appointment_type_id, resource_id, quantity_required)
      VALUES (${id}, ${resource_id}, ${quantity_required})
    `;

    return c.json(
      {
        data: {
          appointment_type_id: id,
          resource_id,
          quantity_required,
          assigned: true,
        },
      },
      201
    );
  }
);

// Remove resource from appointment type
appointmentTypes.delete("/:id/resources/:resourceId", async (c) => {
  const id = c.req.param("id");
  const resourceId = c.req.param("resourceId");

  const result = await sql`
    DELETE FROM appointment_type_resources
    WHERE appointment_type_id = ${id} AND resource_id = ${resourceId}
    RETURNING id
  `;

  if (result.length === 0) {
    return c.json(
      { error: { code: "not_found", message: "Association not found" } },
      404
    );
  }

  return c.json({
    data: { appointment_type_id: id, resource_id: resourceId, removed: true },
  });
});

export default appointmentTypes;
