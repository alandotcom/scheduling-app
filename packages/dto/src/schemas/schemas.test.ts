import { describe, test, expect } from "bun:test";
import {
  // Common
  uuidSchema,
  timeSchema,
  dateSchema,
  weekdaySchema,
  paginationSchema,
  // Org
  createOrgSchema,
  updateOrgSchema,
  // User
  createUserSchema,
  createOrgUserSchema,
  updateOrgUserRoleSchema,
  orgUserListItemSchema,
  orgMembershipRoleSchema,
  // Location
  createLocationSchema,
  // Calendar
  createCalendarSchema,
  // Appointment Type
  createAppointmentTypeSchema,
  createAppointmentTypeResourceSchema,
  // Resource
  createResourceSchema,
  // Client
  createClientSchema,
  updateClientSchema,
  // Appointment
  appointmentStatusSchema,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  // Availability
  createAvailabilityRuleSchema,
  createAvailabilityOverrideSchema,
  createBlockedTimeSchema,
  createSchedulingLimitsSchema,
  availabilityQuerySchema,
  availabilityCheckSchema,
} from "./index";

describe("Common schemas", () => {
  describe("uuidSchema", () => {
    test("accepts valid UUID", () => {
      const result = uuidSchema.safeParse(
        "550e8400-e29b-41d4-a716-446655440000",
      );
      expect(result.success).toBe(true);
    });

    test("rejects invalid UUID", () => {
      const result = uuidSchema.safeParse("not-a-uuid");
      expect(result.success).toBe(false);
    });
  });

  describe("timeSchema", () => {
    test("accepts valid time", () => {
      expect(timeSchema.safeParse("09:00").success).toBe(true);
      expect(timeSchema.safeParse("23:59").success).toBe(true);
      expect(timeSchema.safeParse("00:00").success).toBe(true);
    });

    test("rejects invalid time", () => {
      expect(timeSchema.safeParse("25:00").success).toBe(false);
      expect(timeSchema.safeParse("9:00").success).toBe(false);
      expect(timeSchema.safeParse("09:60").success).toBe(false);
    });
  });

  describe("dateSchema", () => {
    test("accepts valid date", () => {
      expect(dateSchema.safeParse("2024-01-15").success).toBe(true);
      expect(dateSchema.safeParse("2024-12-31").success).toBe(true);
    });

    test("rejects invalid date format", () => {
      expect(dateSchema.safeParse("01-15-2024").success).toBe(false);
      expect(dateSchema.safeParse("2024/01/15").success).toBe(false);
    });
  });

  describe("weekdaySchema", () => {
    test("accepts valid weekday", () => {
      for (let i = 0; i <= 6; i++) {
        expect(weekdaySchema.safeParse(i).success).toBe(true);
      }
    });

    test("rejects invalid weekday", () => {
      expect(weekdaySchema.safeParse(-1).success).toBe(false);
      expect(weekdaySchema.safeParse(7).success).toBe(false);
    });
  });

  describe("paginationSchema", () => {
    test("accepts valid pagination", () => {
      const result = paginationSchema.safeParse({ limit: 20 });
      expect(result.success).toBe(true);
    });

    test("applies default limit", () => {
      const result = paginationSchema.parse({});
      expect(result.limit).toBe(20);
    });

    test("rejects out of range limit", () => {
      expect(paginationSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });
});

describe("Org schemas", () => {
  describe("createOrgSchema", () => {
    test("accepts valid input", () => {
      const result = createOrgSchema.safeParse({ name: "Test Org" });
      expect(result.success).toBe(true);
    });

    test("rejects empty name", () => {
      const result = createOrgSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("updateOrgSchema", () => {
    test("accepts partial input", () => {
      const result = updateOrgSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});

describe("User schemas", () => {
  describe("createUserSchema", () => {
    test("accepts valid input", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        name: "Test User",
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid email", () => {
      const result = createUserSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("orgMembershipRoleSchema", () => {
    test("accepts valid roles", () => {
      expect(orgMembershipRoleSchema.safeParse("owner").success).toBe(true);
      expect(orgMembershipRoleSchema.safeParse("admin").success).toBe(true);
      expect(orgMembershipRoleSchema.safeParse("member").success).toBe(true);
    });

    test("rejects invalid role", () => {
      expect(orgMembershipRoleSchema.safeParse("staff").success).toBe(false);
    });
  });

  describe("createOrgUserSchema", () => {
    test("accepts valid input with explicit role", () => {
      const result = createOrgUserSchema.safeParse({
        email: "member@example.com",
        name: "Member User",
        role: "admin",
      });
      expect(result.success).toBe(true);
    });

    test("requires role", () => {
      const result = createOrgUserSchema.safeParse({
        email: "member@example.com",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateOrgUserRoleSchema", () => {
    test("accepts valid role update input", () => {
      const result = updateOrgUserRoleSchema.safeParse({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        role: "owner",
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid role update input", () => {
      const result = updateOrgUserRoleSchema.safeParse({
        userId: "not-a-uuid",
        role: "staff",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("orgUserListItemSchema", () => {
    test("accepts valid list item", () => {
      const result = orgUserListItemSchema.safeParse({
        membershipId: "550e8400-e29b-41d4-a716-446655440001",
        orgId: "550e8400-e29b-41d4-a716-446655440002",
        userId: "550e8400-e29b-41d4-a716-446655440003",
        email: "member@example.com",
        name: "Member User",
        image: null,
        role: "member",
        membershipCreatedAt: new Date(),
        membershipUpdatedAt: new Date(),
        userCreatedAt: new Date(),
        userUpdatedAt: new Date(),
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Location schemas", () => {
  describe("createLocationSchema", () => {
    test("accepts valid input", () => {
      const result = createLocationSchema.safeParse({
        name: "Main Office",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });

    test("requires timezone", () => {
      const result = createLocationSchema.safeParse({
        name: "Main Office",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Calendar schemas", () => {
  describe("createCalendarSchema", () => {
    test("accepts valid input", () => {
      const result = createCalendarSchema.safeParse({
        name: "Room A",
        timezone: "America/Chicago",
      });
      expect(result.success).toBe(true);
    });

    test("accepts with locationId", () => {
      const result = createCalendarSchema.safeParse({
        name: "Room A",
        timezone: "America/Chicago",
        locationId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("AppointmentType schemas", () => {
  describe("createAppointmentTypeSchema", () => {
    test("accepts valid input", () => {
      const result = createAppointmentTypeSchema.safeParse({
        name: "Consultation",
        durationMin: 30,
      });
      expect(result.success).toBe(true);
    });

    test("accepts with optional fields", () => {
      const result = createAppointmentTypeSchema.safeParse({
        name: "Consultation",
        durationMin: 30,
        paddingBeforeMin: 5,
        paddingAfterMin: 10,
        capacity: 3,
      });
      expect(result.success).toBe(true);
    });

    test("rejects non-positive duration", () => {
      expect(
        createAppointmentTypeSchema.safeParse({
          name: "Test",
          durationMin: 0,
        }).success,
      ).toBe(false);

      expect(
        createAppointmentTypeSchema.safeParse({
          name: "Test",
          durationMin: -1,
        }).success,
      ).toBe(false);
    });
  });

  describe("createAppointmentTypeResourceSchema", () => {
    test("accepts valid input", () => {
      const result = createAppointmentTypeResourceSchema.safeParse({
        resourceId: "550e8400-e29b-41d4-a716-446655440000",
        quantityRequired: 2,
      });
      expect(result.success).toBe(true);
    });

    test("defaults quantityRequired to 1", () => {
      const result = createAppointmentTypeResourceSchema.parse({
        resourceId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.quantityRequired).toBe(1);
    });
  });
});

describe("Resource schemas", () => {
  describe("createResourceSchema", () => {
    test("accepts valid input", () => {
      const result = createResourceSchema.safeParse({
        name: "Projector",
        quantity: 3,
      });
      expect(result.success).toBe(true);
    });

    test("defaults quantity to 1", () => {
      const result = createResourceSchema.parse({
        name: "Projector",
      });
      expect(result.quantity).toBe(1);
    });
  });
});

describe("Client schemas", () => {
  describe("createClientSchema", () => {
    test("accepts valid input", () => {
      const result = createClientSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "555-1234",
        phoneCountry: "US",
      });
      expect(result.success).toBe(true);
    });

    test("accepts without optional fields", () => {
      const result = createClientSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
      });
      expect(result.success).toBe(true);
    });

    test("accepts optional referenceId", () => {
      const result = createClientSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
        referenceId: "ext-client-123",
      });
      expect(result.success).toBe(true);
    });

    test("normalizes lowercase phone country to uppercase", () => {
      const result = createClientSchema.parse({
        firstName: "John",
        lastName: "Doe",
        phone: "4155552671",
        phoneCountry: "us",
      });

      expect(result.phoneCountry).toBe("US");
    });

    test("rejects invalid phone country format", () => {
      const result = createClientSchema.safeParse({
        firstName: "John",
        lastName: "Doe",
        phoneCountry: "USA",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateClientSchema", () => {
    test("accepts referenceId update", () => {
      const result = updateClientSchema.safeParse({
        referenceId: "ext-client-123",
      });
      expect(result.success).toBe(true);
    });

    test("accepts clearing referenceId with null", () => {
      const result = updateClientSchema.safeParse({
        referenceId: null,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Appointment schemas", () => {
  describe("appointmentStatusSchema", () => {
    test("accepts valid statuses", () => {
      const statuses = ["scheduled", "confirmed", "cancelled", "no_show"];
      for (const status of statuses) {
        expect(appointmentStatusSchema.safeParse(status).success).toBe(true);
      }
    });

    test("rejects invalid status", () => {
      expect(appointmentStatusSchema.safeParse("pending").success).toBe(false);
    });
  });

  describe("createAppointmentSchema", () => {
    test("accepts valid input", () => {
      const result = createAppointmentSchema.safeParse({
        calendarId: "550e8400-e29b-41d4-a716-446655440000",
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440001",
        clientId: "550e8400-e29b-41d4-a716-446655440002",
        startTime: "2024-01-15T10:00:00Z",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("rescheduleAppointmentSchema", () => {
    test("accepts valid input", () => {
      const result = rescheduleAppointmentSchema.safeParse({
        newStartTime: "2024-01-16T10:00:00Z",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("cancelAppointmentSchema", () => {
    test("accepts without reason", () => {
      const result = cancelAppointmentSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("accepts with reason", () => {
      const result = cancelAppointmentSchema.safeParse({
        reason: "Schedule conflict",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Availability schemas", () => {
  describe("createAvailabilityRuleSchema", () => {
    test("accepts valid input", () => {
      const result = createAvailabilityRuleSchema.safeParse({
        weekday: 1,
        startTime: "09:00",
        endTime: "17:00",
      });
      expect(result.success).toBe(true);
    });

    test("rejects if startTime >= endTime", () => {
      const result = createAvailabilityRuleSchema.safeParse({
        weekday: 1,
        startTime: "17:00",
        endTime: "09:00",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createAvailabilityOverrideSchema", () => {
    test("accepts blocked date as empty ranges", () => {
      const result = createAvailabilityOverrideSchema.safeParse({
        date: "2024-12-25",
        timeRanges: [],
      });
      expect(result.success).toBe(true);
    });

    test("accepts custom time ranges", () => {
      const result = createAvailabilityOverrideSchema.safeParse({
        date: "2024-12-24",
        timeRanges: [
          { startTime: "09:00", endTime: "12:00" },
          { startTime: "13:00", endTime: "17:00" },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("rejects overlapping ranges", () => {
      const result = createAvailabilityOverrideSchema.safeParse({
        date: "2024-12-24",
        timeRanges: [
          { startTime: "09:00", endTime: "12:00" },
          { startTime: "11:00", endTime: "13:00" },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createBlockedTimeSchema", () => {
    test("accepts valid input", () => {
      const result = createBlockedTimeSchema.safeParse({
        startAt: "2024-01-15T12:00:00Z",
        endAt: "2024-01-15T13:00:00Z",
      });
      expect(result.success).toBe(true);
    });

    test("accepts with recurring rule", () => {
      const result = createBlockedTimeSchema.safeParse({
        startAt: "2024-01-15T12:00:00Z",
        endAt: "2024-01-15T13:00:00Z",
        recurringRule: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR",
      });
      expect(result.success).toBe(true);
    });

    test("rejects if startAt >= endAt", () => {
      const result = createBlockedTimeSchema.safeParse({
        startAt: "2024-01-15T13:00:00Z",
        endAt: "2024-01-15T12:00:00Z",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createSchedulingLimitsSchema", () => {
    test("accepts valid input", () => {
      const result = createSchedulingLimitsSchema.safeParse({
        minNoticeHours: 24,
        maxNoticeDays: 30,
        maxPerDay: 10,
      });
      expect(result.success).toBe(true);
    });

    test("accepts empty input", () => {
      const result = createSchedulingLimitsSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("availabilityQuerySchema", () => {
    test("accepts valid input", () => {
      const result = availabilityQuerySchema.safeParse({
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440000",
        calendarIds: ["550e8400-e29b-41d4-a716-446655440001"],
        startDate: "2024-01-15",
        endDate: "2024-01-31",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });

    test("rejects empty calendarIds", () => {
      const result = availabilityQuerySchema.safeParse({
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440000",
        calendarIds: [],
        startDate: "2024-01-15",
        endDate: "2024-01-31",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("availabilityCheckSchema", () => {
    test("accepts valid input", () => {
      const result = availabilityCheckSchema.safeParse({
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440000",
        calendarId: "550e8400-e29b-41d4-a716-446655440001",
        startTime: "2024-01-15T10:00:00Z",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });
  });
});
