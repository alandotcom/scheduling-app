// MSW handlers and fixture factories for API mocking

import { http, HttpResponse } from "msw";
import type {
  AppointmentWithRelations,
  AppointmentScheduleEvent,
} from "@scheduling/dto";

// Types for fixtures
interface CalendarFixture {
  id: string;
  name: string;
  timezone: string;
  orgId: string;
  locationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentTypeFixture {
  id: string;
  name: string;
  durationMin: number;
  orgId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Counter for unique IDs
let idCounter = 1;

function nextId(): string {
  return `test-id-${idCounter++}`;
}

export function resetIdCounter() {
  idCounter = 1;
}

// Fixture factories
export function createCalendarFixture(
  overrides: Partial<CalendarFixture> = {},
): CalendarFixture {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Calendar ${id}`,
    timezone: "America/New_York",
    orgId: "test-org-id",
    locationId: "test-location-id",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createAppointmentTypeFixture(
  overrides: Partial<AppointmentTypeFixture> = {},
): AppointmentTypeFixture {
  const id = overrides.id ?? nextId();
  return {
    id,
    name: `Appointment Type ${id}`,
    durationMin: 30,
    orgId: "test-org-id",
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createAppointmentFixture(
  overrides: Partial<AppointmentWithRelations> = {},
): AppointmentWithRelations {
  const id = overrides.id ?? nextId();
  const now = new Date();
  const startAt = overrides.startAt ?? now;
  const endAt = overrides.endAt ?? new Date(now.getTime() + 30 * 60 * 1000);

  return {
    id,
    orgId: "test-org-id",
    calendarId: "test-calendar-id",
    appointmentTypeId: "test-type-id",
    clientId: "test-client-id",
    startAt,
    endAt,
    timezone: "America/New_York",
    status: "scheduled",
    notes: null,
    createdAt: now,
    updatedAt: now,
    calendar: {
      id: "test-calendar-id",
      name: "Dr. Smith",
      timezone: "America/New_York",
    },
    appointmentType: {
      id: "test-type-id",
      name: "Initial Consultation",
      durationMin: 30,
    },
    client: {
      id: "test-client-id",
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
    },
    ...overrides,
  };
}

export function createScheduleEventFixture(
  overrides: Partial<AppointmentScheduleEvent> = {},
): AppointmentScheduleEvent {
  const id = overrides.id ?? nextId();
  const now = new Date();
  const startAt = overrides.startAt ?? now;
  const endAt = overrides.endAt ?? new Date(now.getTime() + 30 * 60 * 1000);

  return {
    id,
    status: "scheduled",
    startAt,
    endAt,
    calendarId: "test-calendar-id",
    calendarColor: "#3B82F6",
    clientName: "John Doe",
    appointmentTypeName: "Initial Consultation",
    locationName: "Main Office",
    hasNotes: false,
    resourceSummary: null,
    ...overrides,
  };
}

// Default mock data
let mockAppointments: AppointmentWithRelations[] = [];
let mockScheduleEvents: AppointmentScheduleEvent[] = [];
let mockCalendars: CalendarFixture[] = [];
let mockAppointmentTypes: AppointmentTypeFixture[] = [];

export function setMockAppointments(appointments: AppointmentWithRelations[]) {
  mockAppointments = appointments;
}

export function setMockScheduleEvents(events: AppointmentScheduleEvent[]) {
  mockScheduleEvents = events;
}

export function setMockCalendars(calendars: CalendarFixture[]) {
  mockCalendars = calendars;
}

export function setMockAppointmentTypes(types: AppointmentTypeFixture[]) {
  mockAppointmentTypes = types;
}

export function resetMockData() {
  mockAppointments = [];
  mockScheduleEvents = [];
  mockCalendars = [];
  mockAppointmentTypes = [];
  resetIdCounter();
}

// MSW handlers
export const handlers = [
  // List appointments
  http.post("*/v1/appointments.list", () => {
    return HttpResponse.json({
      items: mockAppointments,
      nextCursor: null,
      hasMore: false,
    });
  }),

  // Get single appointment
  http.post("*/v1/appointments.get", async ({ request }) => {
    const body = (await request.json()) as { id: string };
    const appointment = mockAppointments.find((a) => a.id === body.id);
    if (!appointment) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(appointment);
  }),

  // Range query for schedule view
  http.post("*/v1/appointments.range", () => {
    return HttpResponse.json({
      items: mockScheduleEvents,
      nextCursor: null,
      hasMore: mockScheduleEvents.length >= 200,
    });
  }),

  // Cancel appointment
  http.post("*/v1/appointments.cancel", async ({ request }) => {
    const body = (await request.json()) as { id: string };
    const index = mockAppointments.findIndex((a) => a.id === body.id);
    if (index !== -1) {
      mockAppointments[index] = {
        ...mockAppointments[index]!,
        status: "cancelled",
      };
    }
    return HttpResponse.json({ success: true });
  }),

  // No-show appointment
  http.post("*/v1/appointments.noShow", async ({ request }) => {
    const body = (await request.json()) as { id: string };
    const index = mockAppointments.findIndex((a) => a.id === body.id);
    if (index !== -1) {
      mockAppointments[index] = {
        ...mockAppointments[index]!,
        status: "no_show",
      };
    }
    return HttpResponse.json({ success: true });
  }),

  // List calendars
  http.post("*/v1/calendars.list", () => {
    return HttpResponse.json({
      items: mockCalendars,
      nextCursor: null,
      hasMore: false,
    });
  }),

  // List appointment types
  http.post("*/v1/appointmentTypes.list", () => {
    return HttpResponse.json({
      items: mockAppointmentTypes,
      nextCursor: null,
      hasMore: false,
    });
  }),
];
