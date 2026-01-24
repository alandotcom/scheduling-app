import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getAvailableDates,
  getAvailableTimes,
  checkAvailability,
} from "../services/availability";
import { uuidSchema, timezoneSchema } from "../schemas";

const availability = new Hono();

// Schema for GET /availability/dates
const availableDatesQuerySchema = z.object({
  appointment_type_id: uuidSchema,
  calendar_id: uuidSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
  timezone: timezoneSchema.optional(),
});

// Schema for GET /availability/times
const availableTimesQuerySchema = z.object({
  appointment_type_id: uuidSchema,
  calendar_id: uuidSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  timezone: timezoneSchema.optional(),
});

// Schema for POST /availability/check
const checkAvailabilitySchema = z.object({
  appointment_type_id: uuidSchema,
  calendar_id: uuidSchema,
  datetime: z.string().datetime({ message: "datetime must be in ISO 8601 format" }),
  ignore_appointment_id: uuidSchema.optional(),
});

// GET /availability/dates - Get available dates for an appointment type + calendar in a month
availability.get(
  "/dates",
  zValidator("query", availableDatesQuerySchema),
  async (c) => {
    const { appointment_type_id, calendar_id, month, timezone } = c.req.valid("query");

    try {
      const dates = await getAvailableDates(
        appointment_type_id,
        calendar_id,
        month,
        timezone
      );

      return c.json({ data: { dates } });
    } catch (error) {
      console.error("Error getting available dates:", error);
      return c.json(
        {
          error: {
            code: "availability_error",
            message: "Failed to get available dates",
          },
        },
        500
      );
    }
  }
);

// GET /availability/times - Get available time slots for a specific date
availability.get(
  "/times",
  zValidator("query", availableTimesQuerySchema),
  async (c) => {
    const { appointment_type_id, calendar_id, date, timezone } = c.req.valid("query");

    try {
      const times = await getAvailableTimes(
        appointment_type_id,
        calendar_id,
        date,
        timezone
      );

      return c.json({ data: { times } });
    } catch (error) {
      console.error("Error getting available times:", error);
      return c.json(
        {
          error: {
            code: "availability_error",
            message: "Failed to get available times",
          },
        },
        500
      );
    }
  }
);

// POST /availability/check - Check if a specific datetime is available
availability.post(
  "/check",
  zValidator("json", checkAvailabilitySchema),
  async (c) => {
    const { appointment_type_id, calendar_id, datetime, ignore_appointment_id } =
      c.req.valid("json");

    try {
      const result = await checkAvailability(
        appointment_type_id,
        calendar_id,
        datetime,
        ignore_appointment_id
      );

      return c.json({ data: result });
    } catch (error) {
      console.error("Error checking availability:", error);
      return c.json(
        {
          error: {
            code: "availability_error",
            message: "Failed to check availability",
          },
        },
        500
      );
    }
  }
);

export default availability;
