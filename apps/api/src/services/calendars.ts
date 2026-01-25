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
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import type { ServiceContext } from "./locations.js";

// Transform joined result to response format
function toCalendarResponse(row: CalendarWithLocation) {
  return {
    ...row.calendar,
    location: row.location ?? undefined,
  };
}

export class CalendarService {
  async list(
    input: CalendarListInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<Calendar>> {
    return withOrg(context.orgId, (tx) =>
      calendarRepository.findMany(tx, context.orgId, input),
    );
  }

  async get(
    id: string,
    context: ServiceContext,
  ): Promise<ReturnType<typeof toCalendarResponse>> {
    return withOrg(context.orgId, async (tx) => {
      const result = await calendarRepository.findByIdWithLocation(
        tx,
        context.orgId,
        id,
      );

      if (!result) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      return toCalendarResponse(result);
    });
  }

  async create(
    input: CalendarCreateInput,
    context: ServiceContext,
  ): Promise<Calendar> {
    const { orgId } = context;

    // Validate location if provided
    if (input.locationId) {
      const locationExists = await withOrg(orgId, (tx) =>
        calendarRepository.verifyLocationAccess(tx, orgId, input.locationId!),
      );
      if (!locationExists) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }
    }

    return withOrg(orgId, async (tx) => {
      const calendar = await calendarRepository.create(tx, orgId, input);

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

  async update(
    id: string,
    data: CalendarUpdateInput,
    context: ServiceContext,
  ): Promise<Calendar> {
    const { orgId } = context;

    // Validate location if being updated
    if (data.locationId !== undefined && data.locationId !== null) {
      const locationExists = await withOrg(orgId, (tx) =>
        calendarRepository.verifyLocationAccess(tx, orgId, data.locationId!),
      );
      if (!locationExists) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }
    }

    return withOrg(orgId, async (tx) => {
      const existing = await calendarRepository.findById(tx, orgId, id);

      if (!existing) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      const updated = await calendarRepository.update(tx, orgId, id, data);

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

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await calendarRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      await calendarRepository.delete(tx, context.orgId, id);

      await events.calendarDeleted(
        context.orgId,
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
