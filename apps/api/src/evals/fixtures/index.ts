// Consistent UUIDs for cross-referencing between fixtures
export const ids = {
  clients: {
    ada: "019532a1-0000-7000-8000-000000000001",
    john: "019532a1-0000-7000-8000-000000000002",
    maria: "019532a1-0000-7000-8000-000000000003",
  },
  calendars: {
    drSmith: "019532a2-0000-7000-8000-000000000001",
    drPatel: "019532a2-0000-7000-8000-000000000002",
  },
  appointmentTypes: {
    initial: "019532a3-0000-7000-8000-000000000001",
    followUp: "019532a3-0000-7000-8000-000000000002",
    quickCheckin: "019532a3-0000-7000-8000-000000000003",
  },
  appointments: {
    scheduled: "019532a4-0000-7000-8000-000000000001",
    confirmed: "019532a4-0000-7000-8000-000000000002",
    cancelled: "019532a4-0000-7000-8000-000000000003",
    noShow: "019532a4-0000-7000-8000-000000000004",
  },
} as const;

export interface MockFixtures {
  clients: {
    rows: Array<{
      id: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      appointmentCount: number;
      createdAt: string;
    }>;
  };
  appointments: {
    rows: Array<{
      id: string;
      clientId: string;
      clientName: string;
      calendarId: string | null;
      appointmentTypeId: string | null;
      startAt: string;
      endAt: string;
      timezone: string;
      status: "scheduled" | "confirmed" | "cancelled" | "no_show";
      calendarName: string | null;
      appointmentTypeName: string | null;
    }>;
  };
  calendars: {
    rows: Array<{
      id: string;
      name: string;
      timezone: string;
      requiresConfirmation: boolean;
      locationId: string | null;
    }>;
  };
  appointmentTypes: {
    rows: Array<{
      id: string;
      name: string;
      durationMin: number;
      capacity: number;
    }>;
  };
  slots: {
    totalSlots: number;
    availableCount: number;
    calendarTimezone: string;
    slots: Array<{
      start: string;
      end: string;
      remainingCapacity: number;
    }>;
  };
}

export const defaultFixtures: MockFixtures = {
  clients: {
    rows: [
      {
        id: ids.clients.ada,
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+15551234567",
        appointmentCount: 3,
        createdAt: "2026-01-10T09:00:00.000Z",
      },
      {
        id: ids.clients.john,
        fullName: "John Smith",
        email: "john.smith@example.com",
        phone: "+15559876543",
        appointmentCount: 1,
        createdAt: "2026-02-01T14:30:00.000Z",
      },
      {
        id: ids.clients.maria,
        fullName: "Maria Garcia",
        email: "maria.garcia@example.com",
        phone: null,
        appointmentCount: 0,
        createdAt: "2026-03-01T08:00:00.000Z",
      },
    ],
  },
  calendars: {
    rows: [
      {
        id: ids.calendars.drSmith,
        name: "Dr. Smith",
        timezone: "America/New_York",
        requiresConfirmation: false,
        locationId: null,
      },
      {
        id: ids.calendars.drPatel,
        name: "Dr. Patel",
        timezone: "America/Chicago",
        requiresConfirmation: true,
        locationId: null,
      },
    ],
  },
  appointmentTypes: {
    rows: [
      {
        id: ids.appointmentTypes.initial,
        name: "Initial Consultation",
        durationMin: 60,
        capacity: 1,
      },
      {
        id: ids.appointmentTypes.followUp,
        name: "Follow-up Visit",
        durationMin: 30,
        capacity: 1,
      },
      {
        id: ids.appointmentTypes.quickCheckin,
        name: "Quick Check-in",
        durationMin: 15,
        capacity: 1,
      },
    ],
  },
  appointments: {
    rows: [
      {
        id: ids.appointments.scheduled,
        clientId: ids.clients.ada,
        clientName: "Ada Lovelace",
        calendarId: ids.calendars.drSmith,
        appointmentTypeId: ids.appointmentTypes.initial,
        startAt: "2026-03-17T14:00:00.000Z",
        endAt: "2026-03-17T15:00:00.000Z",
        timezone: "America/New_York",
        status: "scheduled",
        calendarName: "Dr. Smith",
        appointmentTypeName: "Initial Consultation",
      },
      {
        id: ids.appointments.confirmed,
        clientId: ids.clients.john,
        clientName: "John Smith",
        calendarId: ids.calendars.drPatel,
        appointmentTypeId: ids.appointmentTypes.followUp,
        startAt: "2026-03-18T10:00:00.000Z",
        endAt: "2026-03-18T10:30:00.000Z",
        timezone: "America/Chicago",
        status: "confirmed",
        calendarName: "Dr. Patel",
        appointmentTypeName: "Follow-up Visit",
      },
      {
        id: ids.appointments.cancelled,
        clientId: ids.clients.ada,
        clientName: "Ada Lovelace",
        calendarId: ids.calendars.drSmith,
        appointmentTypeId: ids.appointmentTypes.followUp,
        startAt: "2026-03-10T09:00:00.000Z",
        endAt: "2026-03-10T09:30:00.000Z",
        timezone: "America/New_York",
        status: "cancelled",
        calendarName: "Dr. Smith",
        appointmentTypeName: "Follow-up Visit",
      },
      {
        id: ids.appointments.noShow,
        clientId: ids.clients.maria,
        clientName: "Maria Garcia",
        calendarId: ids.calendars.drPatel,
        appointmentTypeId: ids.appointmentTypes.quickCheckin,
        startAt: "2026-03-05T16:00:00.000Z",
        endAt: "2026-03-05T16:15:00.000Z",
        timezone: "America/Chicago",
        status: "no_show",
        calendarName: "Dr. Patel",
        appointmentTypeName: "Quick Check-in",
      },
    ],
  },
  slots: {
    totalSlots: 8,
    availableCount: 5,
    calendarTimezone: "America/New_York",
    slots: [
      {
        start: "2026-03-17T13:00:00.000Z",
        end: "2026-03-17T14:00:00.000Z",
        remainingCapacity: 1,
      },
      {
        start: "2026-03-17T15:00:00.000Z",
        end: "2026-03-17T16:00:00.000Z",
        remainingCapacity: 1,
      },
      {
        start: "2026-03-18T09:00:00.000Z",
        end: "2026-03-18T10:00:00.000Z",
        remainingCapacity: 1,
      },
      {
        start: "2026-03-18T13:00:00.000Z",
        end: "2026-03-18T14:00:00.000Z",
        remainingCapacity: 1,
      },
      {
        start: "2026-03-19T10:00:00.000Z",
        end: "2026-03-19T11:00:00.000Z",
        remainingCapacity: 1,
      },
    ],
  },
};
