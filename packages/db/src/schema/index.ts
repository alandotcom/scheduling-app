import {
  pgTable,
  pgPolicy,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
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
  ...timestamps,
});

export const users = pgTable("users", {
  id,
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  name: text("name"),
  image: text("image"),
  ...timestamps,
});

export const orgMemberships = pgTable.withRLS(
  "org_memberships",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(), // 'admin' | 'staff'
    ...timestamps,
  },
  (table) => [
    uniqueIndex("org_memberships_org_user_idx").on(table.orgId, table.userId),
    pgPolicy("user_org_memberships", {
      for: "all",
      using: sql`org_id = current_org_id() OR user_id = current_user_id()`,
      withCheck: sql`org_id = current_org_id() OR user_id = current_user_id()`,
    }),
  ],
);

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
    metadata: jsonb("metadata"),
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
      .references(() => appointmentTypes.id),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id),
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
      .references(() => appointmentTypes.id),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id),
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
    email: text("email"),
    phone: text("phone"),
    ...timestamps,
  },
  () => [
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
      .references(() => calendars.id),
    appointmentTypeId: uuid("appointment_type_id")
      .notNull()
      .references(() => appointmentTypes.id),
    clientId: uuid("client_id").references(() => clients.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    status: appointmentStatusEnum("status").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
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
      .references(() => calendars.id),
    weekday: integer("weekday").notNull(), // 0-6
    startTime: text("start_time").notNull(), // HH:MM
    endTime: text("end_time").notNull(),
    intervalMin: integer("interval_min"),
    groupId: uuid("group_id"),
  },
  (table) => [index("availability_rules_calendar_idx").on(table.calendarId)],
);

export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id,
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id),
    date: text("date").notNull(), // YYYY-MM-DD
    startTime: text("start_time"),
    endTime: text("end_time"),
    isBlocked: boolean("is_blocked").default(false),
    intervalMin: integer("interval_min"),
    groupId: uuid("group_id"),
  },
  (table) => [
    index("availability_overrides_calendar_date_idx").on(
      table.calendarId,
      table.date,
    ),
  ],
);

export const blockedTime = pgTable(
  "blocked_time",
  {
    id,
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    recurringRule: text("recurring_rule"), // RRULE
  },
  (table) => [
    index("blocked_time_calendar_start_idx").on(
      table.calendarId,
      table.startAt,
    ),
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

export const schedulingLimits = pgTable("scheduling_limits", {
  id,
  calendarId: uuid("calendar_id").references(() => calendars.id),
  groupId: uuid("group_id"),
  minNoticeHours: integer("min_notice_hours"),
  maxNoticeDays: integer("max_notice_days"),
  maxPerSlot: integer("max_per_slot"),
  maxPerDay: integer("max_per_day"),
  maxPerWeek: integer("max_per_week"),
});

// ============================================================================
// EVENT OUTBOX
// ============================================================================

export const eventOutbox = pgTable.withRLS(
  "event_outbox",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(), // 'pending' | 'delivered' | 'failed'
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    ...timestamps,
  },
  () => [
    pgPolicy("org_isolation_event_outbox", {
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
// API TOKENS
// ============================================================================

export const apiTokens = pgTable.withRLS(
  "api_tokens",
  {
    id,
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id), // Who created the token
    name: text("name").notNull(), // Human-readable name for the token
    tokenHash: text("token_hash").notNull().unique(), // SHA-256 hash of the token
    tokenPrefix: text("token_prefix").notNull(), // First 8 chars for identification (e.g., "sk_live_")
    scope: text("scope").notNull(), // 'admin' | 'staff'
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  () => [
    pgPolicy("org_isolation_api_tokens", {
      for: "all",
      using: sql`org_id = current_org_id()`,
      withCheck: sql`org_id = current_org_id()`,
    }),
  ],
);

// ============================================================================
// AUDIT EVENTS
// ============================================================================

export const auditEvents = pgTable(
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
  (table) => [index("audit_events_action_id_idx").on(table.action, table.id)],
);
