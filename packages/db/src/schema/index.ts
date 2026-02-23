import {
  pgTable,
  pgPolicy,
  pgEnum,
  type AnyPgColumn,
  customType,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  numeric,
  index,
  check,
  uniqueIndex,
  date,
  time,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "cancelled",
  "no_show",
]);

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "rejected",
  "canceled",
]);

export const journeyStateEnum = pgEnum("journey_state", [
  "draft",
  "published",
  "paused",
]);

export const journeyModeEnum = pgEnum("journey_mode", ["live", "test"]);

export const journeyRunModeEnum = pgEnum("journey_run_mode", ["live", "test"]);
export const journeyTriggerEntityTypeEnum = pgEnum(
  "journey_trigger_entity_type",
  ["appointment", "client"],
);

export const journeyRunStatusEnum = pgEnum("journey_run_status", [
  "planned",
  "running",
  "completed",
  "canceled",
  "failed",
]);

export const journeyDeliveryStatusEnum = pgEnum("journey_delivery_status", [
  "planned",
  "sent",
  "failed",
  "canceled",
  "skipped",
]);

export const journeyRunStepLogStatusEnum = pgEnum(
  "journey_run_step_log_status",
  ["pending", "running", "success", "error", "cancelled"],
);

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// Common column helpers using Postgres 18 native uuidv7()
const id = uuid("id").primaryKey().default(sql`uuidv7()`);
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

// ============================================================================
// CORE TABLES
// ============================================================================

export const orgs = pgTable("orgs", {
  id,
  name: text("name").notNull(),
  slug: text("slug")
    .notNull()
    .unique()
    .default(sql`replace(uuidv7()::text, '-', '')`),
  logo: text("logo"),
  metadata: jsonb("metadata"),
  // Organization settings
  defaultTimezone: text("default_timezone").default("America/New_York"),
  defaultBusinessHoursStart: text("default_business_hours_start").default(
    "09:00",
  ),
  defaultBusinessHoursEnd: text("default_business_hours_end").default("17:00"),
  defaultBusinessDays: jsonb("default_business_days")
    .$type<number[]>()
    .default([1, 2, 3, 4, 5]),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  ...timestamps,
});

export const users = pgTable("users", {
  id,
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  name: text("name"),
  image: text("image"),
  role: text("role").default("user").notNull(),
  banned: boolean("banned").default(false).notNull(),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  ...timestamps,
});

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("org_memberships_org_user_idx").on(table.orgId, table.userId),
  ],
);

export const orgInvitations = pgTable("org_invitations", {
  id,
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: orgRoleEnum("role").notNull().default("member"),
  status: invitationStatusEnum("status").notNull().default("pending"),
  inviterId: uuid("inviter_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  teamId: uuid("team_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const locations = pgTable.withRLS(
  "locations",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    ...timestamps,
  },
  () => [
    pgPolicy("org_isolation_locations", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const calendars = pgTable.withRLS(
  "calendars",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    slotIntervalMin: integer("slot_interval_min").notNull().default(15),
    requiresConfirmation: boolean("requires_confirmation")
      .notNull()
      .default(false),
    ...timestamps,
  },
  () => [
    pgPolicy("org_isolation_calendars", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const appointmentTypes = pgTable.withRLS(
  "appointment_types",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    durationMin: integer("duration_min").notNull(),
    paddingBeforeMin: integer("padding_before_min").default(0),
    paddingAfterMin: integer("padding_after_min").default(0),
    capacity: integer("capacity").default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  () => [
    pgPolicy("org_isolation_appointment_types", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const appointmentTypeCalendars = pgTable(
  "appointment_type_calendars",
  {
    id,
    appointmentTypeId: uuid("appointment_type_id")
      .notNull()
      .references(() => appointmentTypes.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("appointment_type_calendars_type_calendar_idx").on(
      table.appointmentTypeId,
      table.calendarId,
    ),
  ],
);

export const resources = pgTable.withRLS(
  "resources",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    ...timestamps,
  },
  () => [
    pgPolicy("org_isolation_resources", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const appointmentTypeResources = pgTable(
  "appointment_type_resources",
  {
    id,
    appointmentTypeId: uuid("appointment_type_id")
      .notNull()
      .references(() => appointmentTypes.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    quantityRequired: integer("quantity_required").default(1).notNull(),
  },
  (table) => [
    uniqueIndex("appointment_type_resources_type_resource_idx").on(
      table.appointmentTypeId,
      table.resourceId,
    ),
    index("appointment_type_resources_resource_idx").on(
      table.resourceId,
      table.appointmentTypeId,
    ),
  ],
);

export const clients = pgTable.withRLS(
  "clients",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: citext("email"),
    phone: text("phone"),
    referenceId: text("reference_id"),
    ...timestamps,
  },
  (table) => [
    check(
      "clients_phone_e164_check",
      sql`${table.phone} IS NULL OR ${table.phone} ~ '^\\+[1-9][0-9]{1,14}$'`,
    ),
    uniqueIndex("clients_org_email_unique_idx")
      .on(table.orgId, table.email)
      .where(sql`${table.email} IS NOT NULL`),
    uniqueIndex("clients_org_phone_unique_idx")
      .on(table.orgId, table.phone)
      .where(sql`${table.phone} IS NOT NULL`),
    uniqueIndex("clients_org_reference_id_unique_idx")
      .on(table.orgId, table.referenceId)
      .where(sql`${table.referenceId} IS NOT NULL`),
    index("clients_org_updated_id_idx").on(
      table.orgId,
      table.updatedAt,
      table.id,
    ),
    index("clients_first_name_trgm_idx").using(
      "gin",
      sql`${table.firstName} gin_trgm_ops`,
    ),
    index("clients_last_name_trgm_idx").using(
      "gin",
      sql`${table.lastName} gin_trgm_ops`,
    ),
    index("clients_email_trgm_idx")
      .using("gin", sql`${table.email}::text gin_trgm_ops`)
      .where(sql`${table.email} IS NOT NULL`),
    pgPolicy("org_isolation_clients", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

// ============================================================================
// CLIENT CUSTOM ATTRIBUTES
// ============================================================================

export const customAttributeTypeEnum = pgEnum("custom_attribute_type", [
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
  "RELATION_CLIENT",
]);

export const customAttributeRelationTargetEntityEnum = pgEnum(
  "custom_attribute_relation_target_entity",
  ["CLIENT"],
);

export const customAttributeRelationValueModeEnum = pgEnum(
  "custom_attribute_relation_value_mode",
  ["single", "multi"],
);

export const customAttributeRelationPairedRoleEnum = pgEnum(
  "custom_attribute_relation_paired_role",
  ["forward", "reverse"],
);

export const clientCustomAttributeDefinitions = pgTable.withRLS(
  "client_custom_attribute_definitions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    type: customAttributeTypeEnum("type").notNull(),
    slotColumn: text("slot_column"),
    required: boolean("required").default(false).notNull(),
    options: jsonb("options").$type<string[]>(),
    relationTargetEntity: customAttributeRelationTargetEntityEnum(
      "relation_target_entity",
    ),
    relationValueMode: customAttributeRelationValueModeEnum(
      "relation_value_mode",
    ),
    pairedDefinitionId: uuid("paired_definition_id").references(
      (): AnyPgColumn => clientCustomAttributeDefinitions.id,
      { onDelete: "set null" },
    ),
    pairedRole: customAttributeRelationPairedRoleEnum("paired_role"),
    displayOrder: integer("display_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("client_cad_org_field_key_uidx").on(
      table.orgId,
      table.fieldKey,
    ),
    uniqueIndex("client_cad_org_slot_column_uidx").on(
      table.orgId,
      table.slotColumn,
    ),
    pgPolicy("org_isolation_client_custom_attribute_definitions", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const clientCustomAttributeValues = pgTable.withRLS(
  "client_custom_attribute_values",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    // Text slots (TEXT, SELECT)
    t0: text("t0"),
    t1: text("t1"),
    t2: text("t2"),
    t3: text("t3"),
    t4: text("t4"),
    t5: text("t5"),
    t6: text("t6"),
    t7: text("t7"),
    t8: text("t8"),
    t9: text("t9"),
    // Numeric slots (NUMBER)
    n0: numeric("n0", { precision: 18, scale: 4 }),
    n1: numeric("n1", { precision: 18, scale: 4 }),
    n2: numeric("n2", { precision: 18, scale: 4 }),
    n3: numeric("n3", { precision: 18, scale: 4 }),
    n4: numeric("n4", { precision: 18, scale: 4 }),
    // Date slots (DATE)
    d0: timestamp("d0", { withTimezone: true }),
    d1: timestamp("d1", { withTimezone: true }),
    d2: timestamp("d2", { withTimezone: true }),
    // Boolean slots (BOOLEAN)
    b0: boolean("b0"),
    b1: boolean("b1"),
    b2: boolean("b2"),
    b3: boolean("b3"),
    b4: boolean("b4"),
    // JSONB slots (MULTI_SELECT, structured)
    j0: jsonb("j0"),
    j1: jsonb("j1"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("client_cav_org_client_uidx").on(table.orgId, table.clientId),
    pgPolicy("org_isolation_client_custom_attribute_values", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const clientCustomAttributeRelations = pgTable.withRLS(
  "client_custom_attribute_relations",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id")
      .notNull()
      .references(() => clientCustomAttributeDefinitions.id, {
        onDelete: "cascade",
      }),
    sourceClientId: uuid("source_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    targetClientId: uuid("target_client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    check(
      "client_car_source_target_distinct_chk",
      sql`${table.sourceClientId} <> ${table.targetClientId}`,
    ),
    uniqueIndex("client_car_org_definition_source_target_uidx").on(
      table.orgId,
      table.definitionId,
      table.sourceClientId,
      table.targetClientId,
    ),
    index("client_car_org_definition_source_idx").on(
      table.orgId,
      table.definitionId,
      table.sourceClientId,
    ),
    index("client_car_org_definition_target_idx").on(
      table.orgId,
      table.definitionId,
      table.targetClientId,
    ),
    pgPolicy("org_isolation_client_custom_attribute_relations", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const appointments = pgTable.withRLS(
  "appointments",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    appointmentTypeId: uuid("appointment_type_id")
      .notNull()
      .references(() => appointmentTypes.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, {
        onDelete: "cascade",
      }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    status: appointmentStatusEnum("status").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("appointments_org_start_at_id_idx").on(
      table.orgId,
      table.startAt,
      table.id,
    ),
    index("appointments_calendar_start_at_idx")
      .on(table.calendarId, table.startAt)
      .where(sql`${table.status} <> 'cancelled'`),
    index("appointments_calendar_range_gist_idx")
      .using(
        "gist",
        table.calendarId,
        sql`tstzrange(${table.startAt}, ${table.endAt}, '[)')`,
      )
      .where(sql`${table.status} <> 'cancelled'`),
    index("appointments_client_id_idx").on(table.clientId),
    index("appointments_appointment_type_id_active_idx")
      .on(table.appointmentTypeId)
      .where(sql`${table.status} <> 'cancelled'`),
    pgPolicy("org_isolation_appointments", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

// ============================================================================
// AVAILABILITY TABLES
// ============================================================================

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id,
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0-6
    startTime: time("start_time").notNull(), // HH:MM
    endTime: time("end_time").notNull(),
    groupId: uuid("group_id"),
  },
  (table) => [
    index("availability_rules_calendar_weekday_start_id_idx").on(
      table.calendarId,
      table.weekday,
      table.startTime,
      table.id,
    ),
    index("availability_rules_calendar_id_id_idx").on(
      table.calendarId,
      table.id,
    ),
  ],
);

export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id,
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(), // YYYY-MM-DD
    // Empty array means the date is fully blocked.
    timeRanges: jsonb("time_ranges")
      .$type<Array<{ startTime: string; endTime: string }>>()
      .notNull()
      .default([]),
    groupId: uuid("group_id"),
  },
  (table) => [
    uniqueIndex("availability_overrides_calendar_date_unique_idx").on(
      table.calendarId,
      table.date,
    ),
    index("availability_overrides_calendar_id_id_idx").on(
      table.calendarId,
      table.id,
    ),
  ],
);

export const blockedTime = pgTable(
  "blocked_time",
  {
    id,
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    recurringRule: text("recurring_rule"), // RRULE
  },
  (table) => [
    index("blocked_time_calendar_start_idx").on(
      table.calendarId,
      table.startAt,
    ),
    index("blocked_time_calendar_id_id_idx").on(table.calendarId, table.id),
    index("blocked_time_calendar_end_idx").on(table.calendarId, table.endAt),
    index("blocked_time_calendar_range_gist_idx").using(
      "gist",
      table.calendarId,
      sql`tstzrange(${table.startAt}, ${table.endAt}, '[)')`,
    ),
    index("blocked_time_calendar_recurring_idx")
      .on(table.calendarId)
      .where(sql`${table.recurringRule} is not null`),
  ],
);

export const schedulingLimits = pgTable(
  "scheduling_limits",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    calendarId: uuid("calendar_id").references(() => calendars.id, {
      onDelete: "cascade",
    }),
    groupId: uuid("group_id"),
    minNoticeMinutes: integer("min_notice_minutes"),
    maxNoticeDays: integer("max_notice_days"),
    maxPerSlot: integer("max_per_slot"),
    maxPerDay: integer("max_per_day"),
    maxPerWeek: integer("max_per_week"),
  },
  (table) => [
    index("scheduling_limits_calendar_id_idx").on(table.calendarId),
    uniqueIndex("scheduling_limits_org_default_uidx")
      .on(table.orgId)
      .where(sql`${table.calendarId} is null`),
    uniqueIndex("scheduling_limits_org_calendar_uidx")
      .on(table.orgId, table.calendarId)
      .where(sql`${table.calendarId} is not null`),
  ],
);

// ============================================================================
// JOURNEYS
// ============================================================================

export const journeys = pgTable.withRLS(
  "journeys",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: journeyStateEnum("state").notNull().default("draft"),
    mode: journeyModeEnum("mode").notNull().default("live"),
    draftDefinition: jsonb("draft_definition")
      .notNull()
      .$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("journeys_org_name_ci_uidx").on(
      table.orgId,
      sql`lower(${table.name})`,
    ),
    index("journeys_org_updated_at_id_idx").on(
      table.orgId,
      table.updatedAt,
      table.id,
    ),
    pgPolicy("org_isolation_journeys", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const journeyVersions = pgTable.withRLS(
  "journey_versions",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    journeyId: uuid("journey_id")
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definitionSnapshot: jsonb("definition_snapshot")
      .notNull()
      .$type<Record<string, unknown>>(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("journey_versions_org_journey_version_uidx").on(
      table.orgId,
      table.journeyId,
      table.version,
    ),
    index("journey_versions_org_journey_published_at_idx").on(
      table.orgId,
      table.journeyId,
      table.publishedAt,
    ),
    pgPolicy("org_isolation_journey_versions", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const journeyRuns = pgTable.withRLS(
  "journey_runs",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    journeyVersionId: uuid("journey_version_id").references(
      () => journeyVersions.id,
      {
        onDelete: "set null",
      },
    ),
    triggerEntityType: journeyTriggerEntityTypeEnum("trigger_entity_type")
      .notNull()
      .default("appointment"),
    triggerEntityId: uuid("trigger_entity_id").notNull(),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "cascade",
    }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    mode: journeyRunModeEnum("mode").notNull(),
    status: journeyRunStatusEnum("status").notNull(),
    journeyNameSnapshot: text("journey_name_snapshot").notNull(),
    journeyVersionSnapshot: jsonb("journey_version_snapshot")
      .notNull()
      .$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "journey_runs_trigger_identity_check",
      sql`(
        (${table.triggerEntityType} = 'appointment' AND ${table.appointmentId} IS NOT NULL AND ${table.triggerEntityId} = ${table.appointmentId})
        OR
        (${table.triggerEntityType} = 'client' AND ${table.appointmentId} IS NULL AND (${table.clientId} IS NULL OR ${table.triggerEntityId} = ${table.clientId}))
      )`,
    ),
    uniqueIndex("journey_runs_org_identity_uidx").on(
      table.orgId,
      table.journeyVersionId,
      table.triggerEntityType,
      table.triggerEntityId,
      table.mode,
    ),
    index("journey_runs_org_status_idx").on(table.orgId, table.status),
    index("journey_runs_org_mode_started_at_idx").on(
      table.orgId,
      table.mode,
      table.startedAt,
    ),
    index("journey_runs_org_client_started_at_idx").on(
      table.orgId,
      table.clientId,
      table.startedAt,
    ),
    index("journey_runs_org_appointment_started_at_idx").on(
      table.orgId,
      table.appointmentId,
      table.startedAt,
    ),
    pgPolicy("org_isolation_journey_runs", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const journeyDeliveries = pgTable.withRLS(
  "journey_deliveries",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    journeyRunId: uuid("journey_run_id")
      .notNull()
      .references(() => journeyRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    channel: text("channel").notNull(),
    actionType: text("action_type").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: journeyDeliveryStatusEnum("status").notNull(),
    reasonCode: text("reason_code"),
    deterministicKey: text("deterministic_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("journey_deliveries_org_deterministic_key_uidx").on(
      table.orgId,
      table.deterministicKey,
    ),
    index("journey_deliveries_org_run_scheduled_for_idx").on(
      table.orgId,
      table.journeyRunId,
      table.scheduledFor,
    ),
    index("journey_deliveries_org_status_idx").on(table.orgId, table.status),
    pgPolicy("org_isolation_journey_deliveries", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const journeyRunEvents = pgTable.withRLS(
  "journey_run_events",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    journeyRunId: uuid("journey_run_id")
      .notNull()
      .references(() => journeyRuns.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("journey_run_events_org_run_created_at_idx").on(
      table.orgId,
      table.journeyRunId,
      table.createdAt,
    ),
    index("journey_run_events_created_at_brin_idx").using(
      "brin",
      table.createdAt,
    ),
    pgPolicy("org_isolation_journey_run_events", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

export const journeyRunStepLogs = pgTable.withRLS(
  "journey_run_step_logs",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    journeyRunId: uuid("journey_run_id")
      .notNull()
      .references(() => journeyRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    nodeType: text("node_type").notNull(),
    status: journeyRunStepLogStatusEnum("status").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("journey_run_step_logs_org_run_step_uidx").on(
      table.orgId,
      table.journeyRunId,
      table.stepKey,
    ),
    index("journey_run_step_logs_org_run_started_at_idx").on(
      table.orgId,
      table.journeyRunId,
      table.startedAt,
    ),
    index("journey_run_step_logs_org_step_key_idx").on(
      table.orgId,
      table.stepKey,
    ),
    index("journey_run_step_logs_created_at_brin_idx").using(
      "brin",
      table.createdAt,
    ),
    pgPolicy("org_isolation_journey_run_step_logs", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

// ============================================================================
// INTEGRATIONS
// ============================================================================

export const integrations = pgTable.withRLS(
  "integrations",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    secretsEncrypted: text("secrets_encrypted"),
    secretSalt: text("secret_salt"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("integrations_org_key_unique_idx").on(table.orgId, table.key),
    pgPolicy("org_isolation_integrations", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

// ============================================================================
// AUTH TABLES (BetterAuth)
// ============================================================================

export const sessions = pgTable(
  "sessions",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    activeOrganizationId: uuid("active_organization_id"),
    impersonatedBy: uuid("impersonated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(), // BetterAuth: provider's account ID
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"), // Hashed password for credential auth
    ...timestamps,
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable("verifications", {
  id,
  identifier: text("identifier").notNull(), // email or other identifier
  value: text("value").notNull(), // the verification token
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

// ============================================================================
// API KEYS (BetterAuth plugin)
// ============================================================================

export const apiKeys = pgTable("apikey", {
  id,
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refillInterval: integer("refill_interval"),
  refillAmount: integer("refill_amount"),
  lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
  rateLimitTimeWindow: integer("rate_limit_time_window"),
  rateLimitMax: integer("rate_limit_max"),
  requestCount: integer("request_count").notNull().default(0),
  remaining: integer("remaining"),
  lastRequest: timestamp("last_request", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  permissions: text("permissions"),
  metadata: text("metadata"),
  ...timestamps,
});

// ============================================================================
// AUDIT EVENTS
// ============================================================================

export const auditEvents = pgTable.withRLS(
  "audit_events",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id), // Who performed the action (null for system actions)
    actorType: text("actor_type").notNull(), // 'user' | 'api_token' | 'system'
    action: text("action").notNull(), // 'create' | 'update' | 'delete' | 'confirm' | 'cancel' | 'reschedule' | 'no_show'
    entityType: text("entity_type").notNull(), // 'appointment' | 'calendar' | 'location' | 'resource' | 'appointment_type' | 'client'
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"), // Snapshot of entity before change (null for create)
    after: jsonb("after"), // Snapshot of entity after change (null for delete)
    metadata: jsonb("metadata"), // Additional context (e.g., IP address, user agent, reason)
    ...timestamps,
  },
  (table) => [
    index("audit_events_org_id_idx").on(table.orgId, table.id),
    index("audit_events_org_entity_id_idx").on(
      table.orgId,
      table.entityType,
      table.entityId,
      table.id,
    ),
    index("audit_events_org_created_at_id_idx").on(
      table.orgId,
      table.createdAt,
      table.id,
    ),
    index("audit_events_created_at_brin_idx").using("brin", table.createdAt),
    pgPolicy("org_isolation_audit_events", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);
