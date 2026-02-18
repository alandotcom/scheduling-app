import {
  pgTable,
  pgPolicy,
  pgEnum,
  customType,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  check,
  uniqueIndex,
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
      .references(() => orgs.id),
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
      .references(() => orgs.id),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
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
      .references(() => orgs.id),
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
      .references(() => orgs.id),
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
      .references(() => orgs.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: citext("email"),
    phone: text("phone"),
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
    pgPolicy("org_isolation_clients", {
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
      .references(() => orgs.id),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    appointmentTypeId: uuid("appointment_type_id")
      .notNull()
      .references(() => appointmentTypes.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
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
    startTime: text("start_time").notNull(), // HH:MM
    endTime: text("end_time").notNull(),
    intervalMin: integer("interval_min"),
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
    date: text("date").notNull(), // YYYY-MM-DD
    // Empty array means the date is fully blocked.
    timeRanges: jsonb("time_ranges")
      .$type<Array<{ startTime: string; endTime: string }>>()
      .notNull()
      .default([]),
    intervalMin: integer("interval_min"),
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
    calendarId: uuid("calendar_id").references(() => calendars.id, {
      onDelete: "cascade",
    }),
    groupId: uuid("group_id"),
    minNoticeHours: integer("min_notice_hours"),
    maxNoticeDays: integer("max_notice_days"),
    maxPerSlot: integer("max_per_slot"),
    maxPerDay: integer("max_per_day"),
    maxPerWeek: integer("max_per_week"),
  },
  (table) => [index("scheduling_limits_calendar_id_idx").on(table.calendarId)],
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
      .references(() => orgs.id),
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
      .references(() => orgs.id),
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
      .references(() => orgs.id),
    journeyVersionId: uuid("journey_version_id").references(
      () => journeyVersions.id,
      {
        onDelete: "set null",
      },
    ),
    appointmentId: uuid("appointment_id").notNull(),
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
    uniqueIndex("journey_runs_org_identity_uidx").on(
      table.orgId,
      table.journeyVersionId,
      table.appointmentId,
      table.mode,
    ),
    index("journey_runs_org_status_idx").on(table.orgId, table.status),
    index("journey_runs_org_mode_started_at_idx").on(
      table.orgId,
      table.mode,
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
      .references(() => orgs.id),
    journeyRunId: uuid("journey_run_id")
      .notNull()
      .references(() => journeyRuns.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    channel: text("channel").notNull(),
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

// ============================================================================
// INTEGRATIONS
// ============================================================================

export const integrations = pgTable.withRLS(
  "integrations",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
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
    index("integrations_org_key_idx").on(table.orgId, table.key),
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

export const sessions = pgTable("sessions", {
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
});

export const accounts = pgTable("accounts", {
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
});

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
      .references(() => orgs.id),
    actorId: uuid("actor_id").references(() => users.id), // Who performed the action (null for system actions)
    actorType: text("actor_type").notNull(), // 'user' | 'api_token' | 'system'
    action: text("action").notNull(), // 'create' | 'update' | 'delete' | 'cancel' | 'reschedule' | 'no_show'
    entityType: text("entity_type").notNull(), // 'appointment' | 'calendar' | 'location' | 'resource' | 'appointment_type' | 'client'
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"), // Snapshot of entity before change (null for create)
    after: jsonb("after"), // Snapshot of entity after change (null for delete)
    metadata: jsonb("metadata"), // Additional context (e.g., IP address, user agent, reason)
    ...timestamps,
  },
  (table) => [
    index("audit_events_action_id_idx").on(table.action, table.id),
    pgPolicy("org_isolation_audit_events", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);
