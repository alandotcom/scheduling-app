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
  availabilityCalendarPreviewQuerySchema,
  availabilityCheckSchema,
  // Custom Attributes
  customAttributeTypeSchema,
  createCustomAttributeDefinitionSchema,
  updateCustomAttributeDefinitionSchema,
  customAttributeValuesSchema,
  slotUsageSchema,
  // Webhook
  webhookEventDataSchemaByType,
  // Journey
  linearJourneyGraphSchema,
  journeyTriggerConfigSchema,
  type LinearJourneyGraph,
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
      expect(timeSchema.safeParse("09:00:00").success).toBe(true);
      expect(timeSchema.safeParse("23:59:59").success).toBe(true);
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

    test("accepts with slot interval", () => {
      const result = createCalendarSchema.safeParse({
        name: "Room A",
        timezone: "America/Chicago",
        slotIntervalMin: 30,
      });
      expect(result.success).toBe(true);
    });

    test("rejects invalid slot interval", () => {
      const result = createCalendarSchema.safeParse({
        name: "Room A",
        timezone: "America/Chicago",
        slotIntervalMin: 0,
      });
      expect(result.success).toBe(false);
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
        minNoticeMinutes: 15,
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
        calendarId: "550e8400-e29b-41d4-a716-446655440001",
        excludeAppointmentId: "550e8400-e29b-41d4-a716-446655440002",
        startDate: "2024-01-15",
        endDate: "2024-01-31",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });

    test("rejects missing calendarId", () => {
      const result = availabilityQuerySchema.safeParse({
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440000",
        startDate: "2024-01-15",
        endDate: "2024-01-31",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("availabilityCalendarPreviewQuerySchema", () => {
    test("accepts valid draft overlay", () => {
      const result = availabilityCalendarPreviewQuerySchema.safeParse({
        calendarId: "550e8400-e29b-41d4-a716-446655440001",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        timezone: "America/New_York",
        draft: {
          weeklyRules: [
            {
              weekday: 1,
              startTime: "09:00",
              endTime: "17:00",
            },
          ],
          blockedTime: [
            {
              startAt: "2026-01-10T15:00:00Z",
              endAt: "2026-01-10T16:00:00Z",
            },
          ],
          schedulingLimits: {
            minNoticeMinutes: 30,
          },
          dayOverrides: [
            {
              date: "2026-01-12",
              timeRanges: [{ startTime: "10:00", endTime: "12:00" }],
            },
          ],
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("availabilityCheckSchema", () => {
    test("accepts valid input", () => {
      const result = availabilityCheckSchema.safeParse({
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440000",
        calendarId: "550e8400-e29b-41d4-a716-446655440001",
        excludeAppointmentId: "550e8400-e29b-41d4-a716-446655440002",
        startTime: "2024-01-15T10:00:00Z",
        timezone: "America/New_York",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("Custom attribute schemas", () => {
  describe("customAttributeTypeSchema", () => {
    test("accepts all valid types", () => {
      const types = [
        "TEXT",
        "NUMBER",
        "DATE",
        "DATE_TIME",
        "BOOLEAN",
        "SELECT",
        "MULTI_SELECT",
        "RELATION_CLIENT",
      ];
      for (const type of types) {
        expect(customAttributeTypeSchema.safeParse(type).success).toBe(true);
      }
    });

    test("rejects invalid type", () => {
      expect(customAttributeTypeSchema.safeParse("TEXTAREA").success).toBe(
        false,
      );
      expect(customAttributeTypeSchema.safeParse("string").success).toBe(false);
    });
  });

  describe("createCustomAttributeDefinitionSchema", () => {
    test("accepts valid TEXT definition", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "myField",
        label: "My Field",
        type: "TEXT",
      });
      expect(result.success).toBe(true);
    });

    test("applies defaults for required and displayOrder", () => {
      const result = createCustomAttributeDefinitionSchema.parse({
        fieldKey: "myField",
        label: "My Field",
        type: "TEXT",
      });
      expect(result.required).toBe(false);
      expect(result.displayOrder).toBe(0);
    });

    test("accepts SELECT with options", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "status",
        label: "Status",
        type: "SELECT",
        options: ["active", "inactive"],
      });
      expect(result.success).toBe(true);
    });

    test("rejects SELECT without options", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "status",
        label: "Status",
        type: "SELECT",
      });
      expect(result.success).toBe(false);
    });

    test("rejects MULTI_SELECT without options", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "tags",
        label: "Tags",
        type: "MULTI_SELECT",
      });
      expect(result.success).toBe(false);
    });

    test("rejects SELECT with empty options array", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "status",
        label: "Status",
        type: "SELECT",
        options: [],
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty fieldKey", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "",
        label: "My Field",
        type: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    test("rejects fieldKey starting with a number", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "1field",
        label: "My Field",
        type: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    test("rejects fieldKey with special characters", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "my-field",
        label: "My Field",
        type: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    test("accepts fieldKey with underscores", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "my_field_name",
        label: "My Field",
        type: "TEXT",
      });
      expect(result.success).toBe(true);
    });

    test("rejects empty label", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "myField",
        label: "",
        type: "TEXT",
      });
      expect(result.success).toBe(false);
    });

    test("accepts NUMBER type without options", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "age",
        label: "Age",
        type: "NUMBER",
      });
      expect(result.success).toBe(true);
    });

    test("accepts BOOLEAN type", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "isActive",
        label: "Active",
        type: "BOOLEAN",
      });
      expect(result.success).toBe(true);
    });

    test("accepts DATE type", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "birthDate",
        label: "Birth Date",
        type: "DATE",
      });
      expect(result.success).toBe(true);
    });

    test("accepts DATE_TIME type", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "consultationAt",
        label: "Consultation Date Time",
        type: "DATE_TIME",
      });
      expect(result.success).toBe(true);
    });

    test("accepts RELATION_CLIENT type with relation config", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "referredBy",
        label: "Referred By",
        type: "RELATION_CLIENT",
        relationConfig: {
          valueMode: "single",
        },
      });
      expect(result.success).toBe(true);
    });

    test("accepts RELATION_CLIENT with reverse relation configuration", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "referredBy",
        label: "Referred By",
        type: "RELATION_CLIENT",
        relationConfig: {
          valueMode: "single",
        },
        reverseRelation: {
          fieldKey: "referrals",
          label: "Referrals",
          valueMode: "multi",
        },
      });
      expect(result.success).toBe(true);
    });

    test("rejects RELATION_CLIENT without relation config", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "referredBy",
        label: "Referred By",
        type: "RELATION_CLIENT",
      });
      expect(result.success).toBe(false);
    });

    test("rejects RELATION_CLIENT with options", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "referredBy",
        label: "Referred By",
        type: "RELATION_CLIENT",
        relationConfig: {
          valueMode: "single",
        },
        options: ["x"],
      });
      expect(result.success).toBe(false);
    });

    test("rejects non-relation types with relationConfig", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "notes",
        label: "Notes",
        type: "TEXT",
        relationConfig: {
          valueMode: "single",
        },
      });
      expect(result.success).toBe(false);
    });

    test("rejects non-relation types with reverseRelation", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "notes",
        label: "Notes",
        type: "TEXT",
        reverseRelation: {
          fieldKey: "reverseNotes",
          label: "Reverse Notes",
          valueMode: "multi",
        },
      });
      expect(result.success).toBe(false);
    });

    test("rejects RELATION_CLIENT when reverse field key matches primary field key", () => {
      const result = createCustomAttributeDefinitionSchema.safeParse({
        fieldKey: "referredBy",
        label: "Referred By",
        type: "RELATION_CLIENT",
        relationConfig: {
          valueMode: "single",
        },
        reverseRelation: {
          fieldKey: "referredBy",
          label: "Referrals",
          valueMode: "multi",
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateCustomAttributeDefinitionSchema", () => {
    test("accepts partial update with label only", () => {
      const result = updateCustomAttributeDefinitionSchema.safeParse({
        label: "Updated Label",
      });
      expect(result.success).toBe(true);
    });

    test("accepts empty update", () => {
      const result = updateCustomAttributeDefinitionSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("accepts update with options", () => {
      const result = updateCustomAttributeDefinitionSchema.safeParse({
        options: ["a", "b", "c"],
      });
      expect(result.success).toBe(true);
    });

    test("accepts update with required flag", () => {
      const result = updateCustomAttributeDefinitionSchema.safeParse({
        required: true,
      });
      expect(result.success).toBe(true);
    });

    test("accepts update with displayOrder", () => {
      const result = updateCustomAttributeDefinitionSchema.safeParse({
        displayOrder: 5,
      });
      expect(result.success).toBe(true);
    });

    test("rejects negative displayOrder", () => {
      const result = updateCustomAttributeDefinitionSchema.safeParse({
        displayOrder: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("customAttributeValuesSchema", () => {
    test("accepts string values", () => {
      const result = customAttributeValuesSchema.safeParse({
        name: "hello",
      });
      expect(result.success).toBe(true);
    });

    test("accepts number values", () => {
      const result = customAttributeValuesSchema.safeParse({
        age: 25,
      });
      expect(result.success).toBe(true);
    });

    test("accepts boolean values", () => {
      const result = customAttributeValuesSchema.safeParse({
        isActive: true,
      });
      expect(result.success).toBe(true);
    });

    test("accepts null values", () => {
      const result = customAttributeValuesSchema.safeParse({
        field: null,
      });
      expect(result.success).toBe(true);
    });

    test("accepts string array values", () => {
      const result = customAttributeValuesSchema.safeParse({
        tags: ["a", "b"],
      });
      expect(result.success).toBe(true);
    });

    test("accepts mixed value types", () => {
      const result = customAttributeValuesSchema.safeParse({
        name: "test",
        age: 30,
        active: true,
        tags: ["vip"],
        notes: null,
      });
      expect(result.success).toBe(true);
    });

    test("accepts empty record", () => {
      const result = customAttributeValuesSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("rejects object values", () => {
      const result = customAttributeValuesSchema.safeParse({
        nested: { key: "value" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("slotUsageSchema", () => {
    test("accepts valid slot usage", () => {
      const result = slotUsageSchema.safeParse({
        t: { used: 3, total: 10 },
        n: { used: 1, total: 5 },
        d: { used: 0, total: 3 },
        b: { used: 2, total: 5 },
        j: { used: 0, total: 2 },
      });
      expect(result.success).toBe(true);
    });

    test("rejects missing slot prefix", () => {
      const result = slotUsageSchema.safeParse({
        t: { used: 0, total: 10 },
        n: { used: 0, total: 5 },
        d: { used: 0, total: 3 },
        b: { used: 0, total: 5 },
        // missing j
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Webhook schemas", () => {
  const validUuid = "550e8400-e29b-41d4-a716-446655440000";

  describe("client snapshot", () => {
    test("accepts client.created with customAttributes", () => {
      const result = webhookEventDataSchemaByType["client.created"].safeParse({
        clientId: validUuid,
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "+15551234567",
        customAttributes: { tier: "gold", visits: 5 },
      });
      expect(result.success).toBe(true);
    });

    test("accepts client.created with empty customAttributes", () => {
      const result = webhookEventDataSchemaByType["client.created"].safeParse({
        clientId: validUuid,
        firstName: "John",
        lastName: "Doe",
        email: null,
        phone: null,
        customAttributes: {},
      });
      expect(result.success).toBe(true);
    });

    test("rejects client.created without customAttributes", () => {
      const result = webhookEventDataSchemaByType["client.created"].safeParse({
        clientId: validUuid,
        firstName: "John",
        lastName: "Doe",
        email: null,
        phone: null,
      });
      expect(result.success).toBe(false);
    });

    test("accepts client.updated with customAttributes in previous", () => {
      const result = webhookEventDataSchemaByType["client.updated"].safeParse({
        clientId: validUuid,
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        phone: null,
        customAttributes: { tier: "platinum" },
        previous: {
          clientId: validUuid,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: null,
          customAttributes: { tier: "gold" },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("appointment snapshot", () => {
    const baseAppointment = {
      appointmentId: validUuid,
      calendarId: validUuid,
      appointmentTypeId: validUuid,
      clientId: validUuid,
      startAt: "2024-01-15T10:00:00Z",
      endAt: "2024-01-15T11:00:00Z",
      timezone: "America/New_York",
      status: "scheduled",
      notes: null,
      appointment: {
        id: validUuid,
        calendarId: validUuid,
        appointmentTypeId: validUuid,
        clientId: validUuid,
        startAt: "2024-01-15T10:00:00Z",
        endAt: "2024-01-15T11:00:00Z",
        timezone: "America/New_York",
        status: "scheduled",
        notes: null,
      },
    };

    test("accepts appointment.scheduled with client customAttributes", () => {
      const result = webhookEventDataSchemaByType[
        "appointment.scheduled"
      ].safeParse({
        ...baseAppointment,
        client: {
          id: validUuid,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: null,
          customAttributes: { tier: "gold" },
        },
      });
      expect(result.success).toBe(true);
    });

    test("rejects appointment.scheduled without client customAttributes", () => {
      const result = webhookEventDataSchemaByType[
        "appointment.scheduled"
      ].safeParse({
        ...baseAppointment,
        client: {
          id: validUuid,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: null,
        },
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("Journey trigger config schema", () => {
  test("accepts client.created without trackedAttributeKey", () => {
    const result = journeyTriggerConfigSchema.safeParse({
      triggerType: "ClientJourney",
      event: "client.created",
      correlationKey: "clientId",
    });

    expect(result.success).toBe(true);
  });

  test("accepts client.updated when trackedAttributeKey is provided", () => {
    const result = journeyTriggerConfigSchema.safeParse({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "renewalDate",
    });

    expect(result.success).toBe(true);
  });

  test("rejects client.updated when trackedAttributeKey is missing", () => {
    const result = journeyTriggerConfigSchema.safeParse({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const issue = result.error.issues.find(
      (candidate) =>
        candidate.path.join(".") === "trackedAttributeKey" &&
        candidate.message.includes("trackedAttributeKey"),
    );
    expect(issue).toBeDefined();
  });

  test("rejects client.created when trackedAttributeKey is provided", () => {
    const result = journeyTriggerConfigSchema.safeParse({
      triggerType: "ClientJourney",
      event: "client.created",
      correlationKey: "clientId",
      trackedAttributeKey: "renewalDate",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    const issue = result.error.issues.find(
      (candidate) =>
        candidate.path.join(".") === "trackedAttributeKey" &&
        candidate.message.includes("trackedAttributeKey"),
    );
    expect(issue).toBeDefined();
  });
});

describe("Journey graph trigger branching", () => {
  function createTriggerConfig() {
    return {
      triggerType: "AppointmentJourney",
      start: "appointment.scheduled",
      restart: "appointment.rescheduled",
      stop: "appointment.canceled",
      correlationKey: "appointmentId",
    };
  }

  function createBranchedTriggerGraph(): LinearJourneyGraph {
    return {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "send-scheduled",
          attributes: {
            id: "send-scheduled",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Send Scheduled",
              config: { actionType: "send-resend" },
            },
          },
        },
        {
          key: "send-canceled",
          attributes: {
            id: "send-canceled",
            type: "action",
            position: { x: 200, y: 120 },
            data: {
              type: "action",
              label: "Send Canceled",
              config: { actionType: "send-resend" },
            },
          },
        },
      ],
      edges: [
        {
          key: "e-scheduled",
          source: "trigger",
          target: "send-scheduled",
          attributes: {
            id: "e-scheduled",
            source: "trigger",
            target: "send-scheduled",
            sourceHandle: "scheduled",
            label: "Scheduled",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "e-canceled",
          source: "trigger",
          target: "send-canceled",
          attributes: {
            id: "e-canceled",
            source: "trigger",
            target: "send-canceled",
            sourceHandle: "canceled",
            label: "Canceled",
            data: { triggerBranch: "canceled" },
          },
        },
      ],
    };
  }

  test("accepts graph with trigger branch edges", () => {
    const graph = createBranchedTriggerGraph();
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  test("accepts graph with scheduled, canceled, and no-show trigger branches", () => {
    const graph = createBranchedTriggerGraph();
    graph.nodes.push({
      key: "send-no-show",
      attributes: {
        id: "send-no-show",
        type: "action",
        position: { x: 320, y: 120 },
        data: {
          type: "action",
          label: "Send No Show",
          config: { actionType: "send-resend" },
        },
      },
    });
    graph.edges.push({
      key: "e-no-show",
      source: "trigger",
      target: "send-no-show",
      attributes: {
        id: "e-no-show",
        source: "trigger",
        target: "send-no-show",
        sourceHandle: "no_show",
        label: "No Show",
        data: { triggerBranch: "no_show" },
      },
    });

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  test("accepts trigger with scheduled and no-show branches", () => {
    const graph = createBranchedTriggerGraph();
    const cancelEdge = graph.edges.find((edge) => edge.key === "e-canceled");
    if (!cancelEdge) {
      throw new Error("Expected canceled branch edge in fixture");
    }

    cancelEdge.attributes = {
      ...cancelEdge.attributes,
      sourceHandle: "no_show",
      label: "No Show",
      data: { triggerBranch: "no_show" },
    };

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  test("accepts trigger with only scheduled branch", () => {
    const graph = createBranchedTriggerGraph();
    // Remove the canceled branch edge and node
    graph.nodes = graph.nodes.filter((n) => n.key !== "send-canceled");
    graph.edges = graph.edges.filter((e) => e.key !== "e-canceled");
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  test("accepts trigger with no branch labels (backwards compat)", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "send-node",
          attributes: {
            id: "send-node",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Send",
              config: { actionType: "send-resend" },
            },
          },
        },
      ],
      edges: [
        {
          key: "e1",
          source: "trigger",
          target: "send-node",
          attributes: {
            id: "e1",
            source: "trigger",
            target: "send-node",
          },
        },
      ],
    };
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  test("accepts wait node with valid allowed-hours window", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "wait-node",
          attributes: {
            id: "wait-node",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Wait",
              config: {
                actionType: "wait",
                waitDuration: "10m",
                waitAllowedHoursMode: "daily_window",
                waitAllowedStartTime: "09:00",
                waitAllowedEndTime: "17:00",
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "e1",
          source: "trigger",
          target: "wait-node",
          attributes: {
            id: "e1",
            source: "trigger",
            target: "wait-node",
          },
        },
      ],
    };

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(true);
  });

  test("rejects wait node with invalid allowed-hours window", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "wait-node",
          attributes: {
            id: "wait-node",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Wait",
              config: {
                actionType: "wait",
                waitDuration: "10m",
                waitAllowedHoursMode: "daily_window",
                waitAllowedStartTime: "17:00",
                waitAllowedEndTime: "09:00",
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "e1",
          source: "trigger",
          target: "wait-node",
          attributes: {
            id: "e1",
            source: "trigger",
            target: "wait-node",
          },
        },
      ],
    };

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "Wait allowed-hours start must be earlier than end (same-day window only)",
      );
    }
  });

  test("rejects wait node with invalid wait timezone", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "wait-node",
          attributes: {
            id: "wait-node",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Wait",
              config: {
                actionType: "wait",
                waitDuration: "10m",
                waitTimezone: "Not/AZone",
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "e1",
          source: "trigger",
          target: "wait-node",
          attributes: {
            id: "e1",
            source: "trigger",
            target: "wait-node",
          },
        },
      ],
    };

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain("Wait timezone must be a valid IANA timezone");
    }
  });

  test("rejects wait node on canceled branch", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "send-scheduled",
          attributes: {
            id: "send-scheduled",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Send",
              config: { actionType: "send-resend" },
            },
          },
        },
        {
          key: "wait-cancel",
          attributes: {
            id: "wait-cancel",
            type: "action",
            position: { x: 200, y: 120 },
            data: {
              type: "action",
              label: "Wait",
              config: { actionType: "wait", waitDuration: "10m" },
            },
          },
        },
      ],
      edges: [
        {
          key: "e-scheduled",
          source: "trigger",
          target: "send-scheduled",
          attributes: {
            id: "e-scheduled",
            source: "trigger",
            target: "send-scheduled",
            sourceHandle: "scheduled",
            label: "Scheduled",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "e-canceled",
          source: "trigger",
          target: "wait-cancel",
          attributes: {
            id: "e-canceled",
            source: "trigger",
            target: "wait-cancel",
            sourceHandle: "canceled",
            label: "Canceled",
            data: { triggerBranch: "canceled" },
          },
        },
      ],
    };
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(
        "Wait and Wait For Confirmation steps are not allowed on canceled or no-show branches",
      );
    }
  });

  test("rejects wait node on no-show branch", () => {
    const graph = createBranchedTriggerGraph();
    const terminalNode = graph.nodes.find(
      (node) => node.key === "send-canceled",
    );
    const terminalEdge = graph.edges.find((edge) => edge.key === "e-canceled");

    if (!terminalNode || terminalNode.attributes.data.type !== "action") {
      throw new Error("Expected no-show terminal action node in fixture");
    }

    if (!terminalEdge) {
      throw new Error("Expected no-show terminal edge in fixture");
    }

    terminalNode.attributes = {
      ...terminalNode.attributes,
      data: {
        ...terminalNode.attributes.data,
        label: "Wait",
        config: { actionType: "wait", waitDuration: "10m" },
      },
    };
    terminalEdge.attributes = {
      ...terminalEdge.attributes,
      sourceHandle: "no_show",
      label: "No Show",
      data: { triggerBranch: "no_show" },
    };

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "Wait and Wait For Confirmation steps are not allowed on canceled or no-show branches",
      );
    }
  });

  test("rejects wait-for-confirmation node on canceled branch", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "send-scheduled",
          attributes: {
            id: "send-scheduled",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Send",
              config: { actionType: "send-resend" },
            },
          },
        },
        {
          key: "wait-confirmation-cancel",
          attributes: {
            id: "wait-confirmation-cancel",
            type: "action",
            position: { x: 200, y: 120 },
            data: {
              type: "action",
              label: "Wait For Confirmation",
              config: {
                actionType: "wait-for-confirmation",
                confirmationGraceMinutes: 0,
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "e-scheduled",
          source: "trigger",
          target: "send-scheduled",
          attributes: {
            id: "e-scheduled",
            source: "trigger",
            target: "send-scheduled",
            sourceHandle: "scheduled",
            label: "Scheduled",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "e-canceled",
          source: "trigger",
          target: "wait-confirmation-cancel",
          attributes: {
            id: "e-canceled",
            source: "trigger",
            target: "wait-confirmation-cancel",
            sourceHandle: "canceled",
            label: "Canceled",
            data: { triggerBranch: "canceled" },
          },
        },
      ],
    };
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(
        "Wait and Wait For Confirmation steps are not allowed on canceled or no-show branches",
      );
    }
  });

  test("rejects downstream wait-for-confirmation node on canceled branch", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "send-scheduled",
          attributes: {
            id: "send-scheduled",
            type: "action",
            position: { x: -160, y: 120 },
            data: {
              type: "action",
              label: "Send",
              config: { actionType: "send-resend" },
            },
          },
        },
        {
          key: "logger-cancel",
          attributes: {
            id: "logger-cancel",
            type: "action",
            position: { x: 160, y: 120 },
            data: {
              type: "action",
              label: "Logger",
              config: { actionType: "logger" },
            },
          },
        },
        {
          key: "wait-confirmation-cancel",
          attributes: {
            id: "wait-confirmation-cancel",
            type: "action",
            position: { x: 160, y: 240 },
            data: {
              type: "action",
              label: "Wait For Confirmation",
              config: {
                actionType: "wait-for-confirmation",
                confirmationGraceMinutes: 0,
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "e-scheduled",
          source: "trigger",
          target: "send-scheduled",
          attributes: {
            id: "e-scheduled",
            source: "trigger",
            target: "send-scheduled",
            sourceHandle: "scheduled",
            label: "Scheduled",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "e-canceled",
          source: "trigger",
          target: "logger-cancel",
          attributes: {
            id: "e-canceled",
            source: "trigger",
            target: "logger-cancel",
            sourceHandle: "canceled",
            label: "Canceled",
            data: { triggerBranch: "canceled" },
          },
        },
        {
          key: "e-cancel-next",
          source: "logger-cancel",
          target: "wait-confirmation-cancel",
          attributes: {
            id: "e-cancel-next",
            source: "logger-cancel",
            target: "wait-confirmation-cancel",
          },
        },
      ],
    };
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(
        "Wait and Wait For Confirmation steps are not allowed on canceled or no-show branches",
      );
    }
  });

  test("rejects duplicate trigger branch labels", () => {
    const graph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "send1",
          attributes: {
            id: "send1",
            type: "action",
            position: { x: 0, y: 120 },
            data: {
              type: "action",
              label: "Send 1",
              config: { actionType: "send-resend" },
            },
          },
        },
        {
          key: "send2",
          attributes: {
            id: "send2",
            type: "action",
            position: { x: 200, y: 120 },
            data: {
              type: "action",
              label: "Send 2",
              config: { actionType: "send-resend" },
            },
          },
        },
      ],
      edges: [
        {
          key: "e1",
          source: "trigger",
          target: "send1",
          attributes: {
            id: "e1",
            source: "trigger",
            target: "send1",
            sourceHandle: "scheduled",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "e2",
          source: "trigger",
          target: "send2",
          attributes: {
            id: "e2",
            source: "trigger",
            target: "send2",
            sourceHandle: "scheduled",
            data: { triggerBranch: "scheduled" },
          },
        },
      ],
    };
    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);
  });

  test("rejects trigger with four outgoing branches", () => {
    const graph = createBranchedTriggerGraph();
    graph.nodes.push({
      key: "send-extra",
      attributes: {
        id: "send-extra",
        type: "action",
        position: { x: 0, y: 260 },
        data: {
          type: "action",
          label: "Extra",
          config: { actionType: "logger", message: "Extra" },
        },
      },
    });
    graph.nodes.push({
      key: "send-extra-2",
      attributes: {
        id: "send-extra-2",
        type: "action",
        position: { x: 120, y: 260 },
        data: {
          type: "action",
          label: "Extra 2",
          config: { actionType: "logger", message: "Extra 2" },
        },
      },
    });
    graph.edges.push({
      key: "e-extra",
      source: "trigger",
      target: "send-extra",
      attributes: {
        id: "e-extra",
        source: "trigger",
        target: "send-extra",
      },
    });
    graph.edges.push({
      key: "e-extra-2",
      source: "trigger",
      target: "send-extra-2",
      attributes: {
        id: "e-extra-2",
        source: "trigger",
        target: "send-extra-2",
      },
    });

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "Trigger step can have at most three outgoing branches",
      );
    }
  });

  test("rejects trigger with three outgoing edges missing no-show branch label", () => {
    const graph = createBranchedTriggerGraph();
    graph.nodes.push({
      key: "send-extra",
      attributes: {
        id: "send-extra",
        type: "action",
        position: { x: 320, y: 260 },
        data: {
          type: "action",
          label: "Extra",
          config: { actionType: "logger", message: "Extra" },
        },
      },
    });
    graph.edges.push({
      key: "e-extra",
      source: "trigger",
      target: "send-extra",
      attributes: {
        id: "e-extra",
        source: "trigger",
        target: "send-extra",
      },
    });

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        'Trigger step with three outgoing edges must include exactly "scheduled", "canceled", and "no_show" branches',
      );
    }
  });

  test("rejects trigger with two outgoing edges missing the canceled branch label", () => {
    const graph = createBranchedTriggerGraph();
    const cancelEdge = graph.edges.find((edge) => edge.key === "e-canceled");
    if (cancelEdge) {
      cancelEdge.attributes = {
        id: cancelEdge.attributes.id,
        source: cancelEdge.attributes.source,
        target: cancelEdge.attributes.target,
      };
    }

    const result = linearJourneyGraphSchema.safeParse(graph);
    expect(result.success).toBe(false);

    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        'Trigger step with two outgoing edges must include exactly one "scheduled" branch and one terminal branch ("canceled" or "no_show")',
      );
    }
  });
});
