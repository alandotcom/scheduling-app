// Calendar service - business logic layer for calendars

import { calendarRepository } from "../repositories/calendars.js";
import type {
  CalendarCreateInput,
  CalendarUpdateInput,
  Calendar,
  CalendarListInput,
  CalendarWithLocation,
  CalendarWithRelationshipCounts,
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
  ): Promise<PaginatedResult<CalendarWithRelationshipCounts>> {
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

    const calendar = await withOrg(orgId, async (tx) => {
      // Validate location if provided
      if (input.locationId) {
        const locationExists = await calendarRepository.verifyLocationAccess(
          tx,
          orgId,
          input.locationId,
        );
        if (!locationExists) {
          throw new ApplicationError("Location not found", {
            code: "NOT_FOUND",
          });
        }
      }

      const calendar = await calendarRepository.create(tx, orgId, input);
      return calendar;
    });

    await events.calendarCreated(orgId, {
      calendarId: calendar.id,
      name: calendar.name,
      timezone: calendar.timezone,
      locationId: calendar.locationId,
    });

    return calendar;
  }

  async update(
    id: string,
    data: CalendarUpdateInput,
    context: ServiceContext,
  ): Promise<Calendar> {
    const { orgId } = context;

    const { existing, updated } = await withOrg(orgId, async (tx) => {
      // Validate location if being updated
      if (data.locationId !== undefined && data.locationId !== null) {
        const locationExists = await calendarRepository.verifyLocationAccess(
          tx,
          orgId,
          data.locationId,
        );
        if (!locationExists) {
          throw new ApplicationError("Location not found", {
            code: "NOT_FOUND",
          });
        }
      }

      const existing = await calendarRepository.findById(tx, orgId, id);

      if (!existing) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      const updated = await calendarRepository.update(tx, orgId, id, data);

      if (!updated) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      return { existing, updated };
    });

    await events.calendarUpdated(orgId, {
      calendarId: updated.id,
      name: updated.name,
      timezone: updated.timezone,
      locationId: updated.locationId,
      previous: {
        name: existing.name,
        timezone: existing.timezone,
        locationId: existing.locationId,
      },
    });

    return updated;
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const deleted = await withOrg(context.orgId, async (tx) => {
      const existing = await calendarRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      await calendarRepository.delete(tx, context.orgId, id);

      return {
        calendarId: id,
        name: existing.name,
        timezone: existing.timezone,
        locationId: existing.locationId,
      };
    });

    await events.calendarDeleted(context.orgId, deleted);

    return { success: true };
  }
}

// Singleton instance
export const calendarService = new CalendarService();
