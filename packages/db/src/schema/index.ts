import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql, relations } from 'drizzle-orm'

// Common column helpers using Postgres 18 native uuidv7()
const id = uuid('id').primaryKey().default(sql`uuidv7()`)
const orgId = (table: typeof orgs) => uuid('org_id').notNull().references(() => table.id)
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}

// ============================================================================
// CORE TABLES
// ============================================================================

export const orgs = pgTable('orgs', {
  id,
  name: text('name').notNull(),
  ...timestamps,
})

export const orgsRelations = relations(orgs, ({ many }) => ({
  memberships: many(orgMemberships),
  locations: many(locations),
  calendars: many(calendars),
  appointmentTypes: many(appointmentTypes),
  resources: many(resources),
  clients: many(clients),
  appointments: many(appointments),
  eventOutbox: many(eventOutbox),
}))

export const users = pgTable('users', {
  id,
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  name: text('name'),
  image: text('image'),
  ...timestamps,
})

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(orgMemberships),
  sessions: many(sessions),
  accounts: many(accounts),
}))

export const orgMemberships = pgTable('org_memberships', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(), // 'admin' | 'staff'
  ...timestamps,
}, (table) => [
  uniqueIndex('org_memberships_org_user_idx').on(table.orgId, table.userId),
])

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  org: one(orgs, {
    fields: [orgMemberships.orgId],
    references: [orgs.id],
  }),
  user: one(users, {
    fields: [orgMemberships.userId],
    references: [users.id],
  }),
}))

export const locations = pgTable('locations', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  ...timestamps,
})

export const locationsRelations = relations(locations, ({ one, many }) => ({
  org: one(orgs, {
    fields: [locations.orgId],
    references: [orgs.id],
  }),
  calendars: many(calendars),
  resources: many(resources),
}))

export const calendars = pgTable('calendars', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  locationId: uuid('location_id').references(() => locations.id),
  name: text('name').notNull(),
  timezone: text('timezone').notNull(),
  ...timestamps,
})

export const calendarsRelations = relations(calendars, ({ one, many }) => ({
  org: one(orgs, {
    fields: [calendars.orgId],
    references: [orgs.id],
  }),
  location: one(locations, {
    fields: [calendars.locationId],
    references: [locations.id],
  }),
  appointments: many(appointments),
  appointmentTypeCalendars: many(appointmentTypeCalendars),
  availabilityRules: many(availabilityRules),
  availabilityOverrides: many(availabilityOverrides),
  blockedTime: many(blockedTime),
  schedulingLimits: many(schedulingLimits),
}))

export const appointmentTypes = pgTable('appointment_types', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  durationMin: integer('duration_min').notNull(),
  paddingBeforeMin: integer('padding_before_min').default(0),
  paddingAfterMin: integer('padding_after_min').default(0),
  capacity: integer('capacity').default(1),
  metadata: jsonb('metadata'),
  ...timestamps,
})

export const appointmentTypesRelations = relations(appointmentTypes, ({ one, many }) => ({
  org: one(orgs, {
    fields: [appointmentTypes.orgId],
    references: [orgs.id],
  }),
  appointmentTypeCalendars: many(appointmentTypeCalendars),
  appointmentTypeResources: many(appointmentTypeResources),
  appointments: many(appointments),
}))

export const appointmentTypeCalendars = pgTable('appointment_type_calendars', {
  id,
  appointmentTypeId: uuid('appointment_type_id').notNull().references(() => appointmentTypes.id),
  calendarId: uuid('calendar_id').notNull().references(() => calendars.id),
}, (table) => [
  uniqueIndex('appointment_type_calendars_type_calendar_idx').on(table.appointmentTypeId, table.calendarId),
])

export const appointmentTypeCalendarsRelations = relations(appointmentTypeCalendars, ({ one }) => ({
  appointmentType: one(appointmentTypes, {
    fields: [appointmentTypeCalendars.appointmentTypeId],
    references: [appointmentTypes.id],
  }),
  calendar: one(calendars, {
    fields: [appointmentTypeCalendars.calendarId],
    references: [calendars.id],
  }),
}))

export const resources = pgTable('resources', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  locationId: uuid('location_id').references(() => locations.id),
  name: text('name').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  ...timestamps,
})

export const resourcesRelations = relations(resources, ({ one, many }) => ({
  org: one(orgs, {
    fields: [resources.orgId],
    references: [orgs.id],
  }),
  location: one(locations, {
    fields: [resources.locationId],
    references: [locations.id],
  }),
  appointmentTypeResources: many(appointmentTypeResources),
}))

export const appointmentTypeResources = pgTable('appointment_type_resources', {
  id,
  appointmentTypeId: uuid('appointment_type_id').notNull().references(() => appointmentTypes.id),
  resourceId: uuid('resource_id').notNull().references(() => resources.id),
  quantityRequired: integer('quantity_required').default(1).notNull(),
}, (table) => [
  uniqueIndex('appointment_type_resources_type_resource_idx').on(table.appointmentTypeId, table.resourceId),
])

export const appointmentTypeResourcesRelations = relations(appointmentTypeResources, ({ one }) => ({
  appointmentType: one(appointmentTypes, {
    fields: [appointmentTypeResources.appointmentTypeId],
    references: [appointmentTypes.id],
  }),
  resource: one(resources, {
    fields: [appointmentTypeResources.resourceId],
    references: [resources.id],
  }),
}))

export const clients = pgTable('clients', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  ...timestamps,
})

export const clientsRelations = relations(clients, ({ one, many }) => ({
  org: one(orgs, {
    fields: [clients.orgId],
    references: [orgs.id],
  }),
  appointments: many(appointments),
}))

export const appointments = pgTable('appointments', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  calendarId: uuid('calendar_id').notNull().references(() => calendars.id),
  appointmentTypeId: uuid('appointment_type_id').notNull().references(() => appointmentTypes.id),
  clientId: uuid('client_id').references(() => clients.id),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  timezone: text('timezone').notNull(),
  status: text('status').notNull(), // 'scheduled' | 'confirmed' | 'cancelled' | 'no_show'
  notes: text('notes'),
  ...timestamps,
})

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  org: one(orgs, {
    fields: [appointments.orgId],
    references: [orgs.id],
  }),
  calendar: one(calendars, {
    fields: [appointments.calendarId],
    references: [calendars.id],
  }),
  appointmentType: one(appointmentTypes, {
    fields: [appointments.appointmentTypeId],
    references: [appointmentTypes.id],
  }),
  client: one(clients, {
    fields: [appointments.clientId],
    references: [clients.id],
  }),
}))

// ============================================================================
// AVAILABILITY TABLES
// ============================================================================

export const availabilityRules = pgTable('availability_rules', {
  id,
  calendarId: uuid('calendar_id').notNull().references(() => calendars.id),
  weekday: integer('weekday').notNull(), // 0-6
  startTime: text('start_time').notNull(), // HH:MM
  endTime: text('end_time').notNull(),
  intervalMin: integer('interval_min'),
  groupId: uuid('group_id'),
})

export const availabilityRulesRelations = relations(availabilityRules, ({ one }) => ({
  calendar: one(calendars, {
    fields: [availabilityRules.calendarId],
    references: [calendars.id],
  }),
}))

export const availabilityOverrides = pgTable('availability_overrides', {
  id,
  calendarId: uuid('calendar_id').notNull().references(() => calendars.id),
  date: text('date').notNull(), // YYYY-MM-DD
  startTime: text('start_time'),
  endTime: text('end_time'),
  isBlocked: boolean('is_blocked').default(false),
  intervalMin: integer('interval_min'),
  groupId: uuid('group_id'),
})

export const availabilityOverridesRelations = relations(availabilityOverrides, ({ one }) => ({
  calendar: one(calendars, {
    fields: [availabilityOverrides.calendarId],
    references: [calendars.id],
  }),
}))

export const blockedTime = pgTable('blocked_time', {
  id,
  calendarId: uuid('calendar_id').notNull().references(() => calendars.id),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  recurringRule: text('recurring_rule'), // RRULE
})

export const blockedTimeRelations = relations(blockedTime, ({ one }) => ({
  calendar: one(calendars, {
    fields: [blockedTime.calendarId],
    references: [calendars.id],
  }),
}))

export const schedulingLimits = pgTable('scheduling_limits', {
  id,
  calendarId: uuid('calendar_id').references(() => calendars.id),
  groupId: uuid('group_id'),
  minNoticeHours: integer('min_notice_hours'),
  maxNoticeDays: integer('max_notice_days'),
  maxPerSlot: integer('max_per_slot'),
  maxPerDay: integer('max_per_day'),
  maxPerWeek: integer('max_per_week'),
})

export const schedulingLimitsRelations = relations(schedulingLimits, ({ one }) => ({
  calendar: one(calendars, {
    fields: [schedulingLimits.calendarId],
    references: [calendars.id],
  }),
}))

// ============================================================================
// EVENT OUTBOX
// ============================================================================

export const eventOutbox = pgTable('event_outbox', {
  id,
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull(), // 'pending' | 'delivered' | 'failed'
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  ...timestamps,
})

export const eventOutboxRelations = relations(eventOutbox, ({ one }) => ({
  org: one(orgs, {
    fields: [eventOutbox.orgId],
    references: [orgs.id],
  }),
}))

// ============================================================================
// AUTH TABLES (BetterAuth)
// ============================================================================

export const sessions = pgTable('sessions', {
  id,
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  ...timestamps,
})

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const accounts = pgTable('accounts', {
  id,
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  ...timestamps,
})

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const verifications = pgTable('verifications', {
  id,
  identifier: text('identifier').notNull(), // email or other identifier
  value: text('value').notNull(), // the verification token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
})
