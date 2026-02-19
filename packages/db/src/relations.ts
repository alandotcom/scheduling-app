// Drizzle v1 relations using defineRelations (RQBv2)

import { defineRelations } from "drizzle-orm";
import * as schema from "./schema/index.js";

export const relations = defineRelations(schema, (r) => ({
  // Core tables
  orgs: {
    memberships: r.many.orgMemberships(),
    invitations: r.many.orgInvitations(),
    locations: r.many.locations(),
    calendars: r.many.calendars(),
    appointmentTypes: r.many.appointmentTypes(),
    resources: r.many.resources(),
    clients: r.many.clients(),
    appointments: r.many.appointments(),
    integrations: r.many.integrations(),
    auditEvents: r.many.auditEvents(),
    journeys: r.many.journeys(),
    journeyVersions: r.many.journeyVersions(),
    journeyRuns: r.many.journeyRuns(),
    journeyDeliveries: r.many.journeyDeliveries(),
    clientCustomAttributeDefinitions: r.many.clientCustomAttributeDefinitions(),
  },

  users: {
    memberships: r.many.orgMemberships(),
    invitationsSent: r.many.orgInvitations(),
    sessions: r.many.sessions(),
    accounts: r.many.accounts(),
    apiKeys: r.many.apiKeys(),
  },

  orgMemberships: {
    org: r.one.orgs({
      from: r.orgMemberships.orgId,
      to: r.orgs.id,
    }),
    user: r.one.users({
      from: r.orgMemberships.userId,
      to: r.users.id,
    }),
  },

  orgInvitations: {
    org: r.one.orgs({
      from: r.orgInvitations.orgId,
      to: r.orgs.id,
    }),
    inviter: r.one.users({
      from: r.orgInvitations.inviterId,
      to: r.users.id,
    }),
  },

  locations: {
    org: r.one.orgs({
      from: r.locations.orgId,
      to: r.orgs.id,
    }),
    calendars: r.many.calendars(),
    resources: r.many.resources(),
  },

  calendars: {
    org: r.one.orgs({
      from: r.calendars.orgId,
      to: r.orgs.id,
    }),
    location: r.one.locations({
      from: r.calendars.locationId,
      to: r.locations.id,
    }),
    appointments: r.many.appointments(),
    appointmentTypeCalendars: r.many.appointmentTypeCalendars(),
    availabilityRules: r.many.availabilityRules(),
    availabilityOverrides: r.many.availabilityOverrides(),
    blockedTime: r.many.blockedTime(),
    schedulingLimits: r.many.schedulingLimits(),
  },

  appointmentTypes: {
    org: r.one.orgs({
      from: r.appointmentTypes.orgId,
      to: r.orgs.id,
    }),
    appointmentTypeCalendars: r.many.appointmentTypeCalendars(),
    appointmentTypeResources: r.many.appointmentTypeResources(),
    appointments: r.many.appointments(),
  },

  appointmentTypeCalendars: {
    appointmentType: r.one.appointmentTypes({
      from: r.appointmentTypeCalendars.appointmentTypeId,
      to: r.appointmentTypes.id,
    }),
    calendar: r.one.calendars({
      from: r.appointmentTypeCalendars.calendarId,
      to: r.calendars.id,
    }),
  },

  resources: {
    org: r.one.orgs({
      from: r.resources.orgId,
      to: r.orgs.id,
    }),
    location: r.one.locations({
      from: r.resources.locationId,
      to: r.locations.id,
    }),
    appointmentTypeResources: r.many.appointmentTypeResources(),
  },

  appointmentTypeResources: {
    appointmentType: r.one.appointmentTypes({
      from: r.appointmentTypeResources.appointmentTypeId,
      to: r.appointmentTypes.id,
    }),
    resource: r.one.resources({
      from: r.appointmentTypeResources.resourceId,
      to: r.resources.id,
    }),
  },

  clients: {
    org: r.one.orgs({
      from: r.clients.orgId,
      to: r.orgs.id,
    }),
    appointments: r.many.appointments(),
    customAttributeValues: r.many.clientCustomAttributeValues(),
  },

  clientCustomAttributeDefinitions: {
    org: r.one.orgs({
      from: r.clientCustomAttributeDefinitions.orgId,
      to: r.orgs.id,
    }),
  },

  clientCustomAttributeValues: {
    org: r.one.orgs({
      from: r.clientCustomAttributeValues.orgId,
      to: r.orgs.id,
    }),
    client: r.one.clients({
      from: r.clientCustomAttributeValues.clientId,
      to: r.clients.id,
    }),
  },

  appointments: {
    org: r.one.orgs({
      from: r.appointments.orgId,
      to: r.orgs.id,
    }),
    calendar: r.one.calendars({
      from: r.appointments.calendarId,
      to: r.calendars.id,
    }),
    appointmentType: r.one.appointmentTypes({
      from: r.appointments.appointmentTypeId,
      to: r.appointmentTypes.id,
    }),
    client: r.one.clients({
      from: r.appointments.clientId,
      to: r.clients.id,
    }),
  },

  // Availability tables
  availabilityRules: {
    calendar: r.one.calendars({
      from: r.availabilityRules.calendarId,
      to: r.calendars.id,
    }),
  },

  availabilityOverrides: {
    calendar: r.one.calendars({
      from: r.availabilityOverrides.calendarId,
      to: r.calendars.id,
    }),
  },

  blockedTime: {
    calendar: r.one.calendars({
      from: r.blockedTime.calendarId,
      to: r.calendars.id,
    }),
  },

  schedulingLimits: {
    calendar: r.one.calendars({
      from: r.schedulingLimits.calendarId,
      to: r.calendars.id,
    }),
  },

  // Integrations
  integrations: {
    org: r.one.orgs({
      from: r.integrations.orgId,
      to: r.orgs.id,
    }),
  },

  // Journeys
  journeys: {
    org: r.one.orgs({
      from: r.journeys.orgId,
      to: r.orgs.id,
    }),
    versions: r.many.journeyVersions(),
  },

  journeyVersions: {
    org: r.one.orgs({
      from: r.journeyVersions.orgId,
      to: r.orgs.id,
    }),
    journey: r.one.journeys({
      from: r.journeyVersions.journeyId,
      to: r.journeys.id,
    }),
    runs: r.many.journeyRuns(),
  },

  journeyRuns: {
    org: r.one.orgs({
      from: r.journeyRuns.orgId,
      to: r.orgs.id,
    }),
    journeyVersion: r.one.journeyVersions({
      from: r.journeyRuns.journeyVersionId,
      to: r.journeyVersions.id,
    }),
    deliveries: r.many.journeyDeliveries(),
    events: r.many.journeyRunEvents(),
    stepLogs: r.many.journeyRunStepLogs(),
  },

  journeyDeliveries: {
    org: r.one.orgs({
      from: r.journeyDeliveries.orgId,
      to: r.orgs.id,
    }),
    journeyRun: r.one.journeyRuns({
      from: r.journeyDeliveries.journeyRunId,
      to: r.journeyRuns.id,
    }),
  },

  journeyRunEvents: {
    org: r.one.orgs({
      from: r.journeyRunEvents.orgId,
      to: r.orgs.id,
    }),
    journeyRun: r.one.journeyRuns({
      from: r.journeyRunEvents.journeyRunId,
      to: r.journeyRuns.id,
    }),
  },

  journeyRunStepLogs: {
    org: r.one.orgs({
      from: r.journeyRunStepLogs.orgId,
      to: r.orgs.id,
    }),
    journeyRun: r.one.journeyRuns({
      from: r.journeyRunStepLogs.journeyRunId,
      to: r.journeyRuns.id,
    }),
  },

  // Auth tables
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },

  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },

  // API keys
  apiKeys: {
    user: r.one.users({
      from: r.apiKeys.userId,
      to: r.users.id,
    }),
  },

  // Audit events
  auditEvents: {
    org: r.one.orgs({
      from: r.auditEvents.orgId,
      to: r.orgs.id,
    }),
    actor: r.one.users({
      from: r.auditEvents.actorId,
      to: r.users.id,
    }),
  },
}));
