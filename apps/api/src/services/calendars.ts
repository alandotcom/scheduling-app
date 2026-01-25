// Calendar service - business logic layer for calendars

import { calendarRepository } from "../repositories/calendars.js";
import type {
  CalendarCreateInput,
  CalendarUpdateInput,
  Calendar,
  CalendarListInput,
  CalendarWithLocation,
} from "../repositories/calendars.js";
import type { PaginatedResult } from "../repositories/base.js";
import { withRls } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import { requireOrgId } from "../lib/request-context.js";

// Transform joined result to response format
function toCalendarResponse(row: CalendarWithLocation) {
  return {
    ...row.calendar,
    location: row.location ?? undefined,
  };
}

export class CalendarService {
  async list(input: CalendarListInput): Promise<PaginatedResult<Calendar>> {
    return withRls((tx) => calendarRepository.findMany(tx, input));
  }

  async get(id: string): Promise<ReturnType<typeof toCalendarResponse>> {
    return withRls(async (tx) => {
      const result = await calendarRepository.findByIdWithLocation(tx, id);

      if (!result) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      return toCalendarResponse(result);
    });
  }

  async create(input: CalendarCreateInput): Promise<Calendar> {
    const orgId = requireOrgId();

    // Validate location if provided
    if (input.locationId) {
      const locationExists = await withRls((tx) =>
        calendarRepository.verifyLocationAccess(tx, input.locationId!),
      );
      if (!locationExists) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }
    }

    return withRls(async (tx) => {
      const calendar = await calendarRepository.create(tx, input);

      await events.calendarCreated(
        orgId,
        {
          calendarId: calendar.id,
          name: calendar.name,
          timezone: calendar.timezone,
          locationId: calendar.locationId,
        },
        tx,
      );

      return calendar;
    });
  }

  async update(id: string, data: CalendarUpdateInput): Promise<Calendar> {
    const orgId = requireOrgId();

    // Validate location if being updated
    if (data.locationId !== undefined && data.locationId !== null) {
      const locationExists = await withRls((tx) =>
        calendarRepository.verifyLocationAccess(tx, data.locationId!),
      );
      if (!locationExists) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }
    }

    return withRls(async (tx) => {
      const existing = await calendarRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      const updated = await calendarRepository.update(tx, id, data);

      if (!updated) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      await events.calendarUpdated(
        orgId,
        {
          calendarId: updated.id,
          changes: data,
          previous: {
            name: existing.name,
            timezone: existing.timezone,
            locationId: existing.locationId,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async delete(id: string): Promise<{ success: true }> {
    const orgId = requireOrgId();

    return withRls(async (tx) => {
      const existing = await calendarRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      await calendarRepository.delete(tx, id);

      await events.calendarDeleted(
        orgId,
        {
          calendarId: id,
          name: existing.name,
          timezone: existing.timezone,
          locationId: existing.locationId,
        },
        tx,
      );

      return { success: true };
    });
  }
}

// Singleton instance
export const calendarService = new CalendarService();
