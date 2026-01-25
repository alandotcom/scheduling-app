// Appointment type service - business logic layer for appointment types

import { appointmentTypeRepository } from "../repositories/appointment-types.js";
import type {
  AppointmentTypeCreateInput,
  AppointmentTypeUpdateInput,
  AppointmentType,
  AppointmentTypeWithLinks,
} from "../repositories/appointment-types.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withRls } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import { requireOrgId } from "../lib/request-context.js";

// Transform joined result to response format
function toAppointmentTypeResponse(row: AppointmentTypeWithLinks) {
  return {
    ...row.appointmentType,
    calendars: row.calendars,
    resources: row.resources,
  };
}

export interface LinkCalendarInput {
  calendarId: string;
}

export interface UnlinkCalendarInput {
  calendarId: string;
}

export interface LinkResourceInput {
  resourceId: string;
  quantityRequired?: number | undefined;
}

export interface UnlinkResourceInput {
  resourceId: string;
}

export class AppointmentTypeService {
  async list(
    input: PaginationInput,
  ): Promise<PaginatedResult<AppointmentType>> {
    return withRls((tx) => appointmentTypeRepository.findMany(tx, input));
  }

  async get(id: string): Promise<ReturnType<typeof toAppointmentTypeResponse>> {
    return withRls(async (tx) => {
      const result = await appointmentTypeRepository.findByIdWithLinks(tx, id);

      if (!result) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      return toAppointmentTypeResponse(result);
    });
  }

  async create(input: AppointmentTypeCreateInput): Promise<AppointmentType> {
    const orgId = requireOrgId();

    return withRls(async (tx) => {
      const appointmentType = await appointmentTypeRepository.create(tx, input);

      await events.appointmentTypeCreated(
        orgId,
        {
          appointmentTypeId: appointmentType.id,
          name: appointmentType.name,
          durationMin: appointmentType.durationMin,
          paddingBeforeMin: appointmentType.paddingBeforeMin,
          paddingAfterMin: appointmentType.paddingAfterMin,
          capacity: appointmentType.capacity,
        },
        tx,
      );

      return appointmentType;
    });
  }

  async update(
    id: string,
    data: AppointmentTypeUpdateInput,
  ): Promise<AppointmentType> {
    const orgId = requireOrgId();

    return withRls(async (tx) => {
      const existing = await appointmentTypeRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      const updated = await appointmentTypeRepository.update(tx, id, data);

      if (!updated) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      await events.appointmentTypeUpdated(
        orgId,
        {
          appointmentTypeId: updated.id,
          changes: data,
          previous: {
            name: existing.name,
            durationMin: existing.durationMin,
            paddingBeforeMin: existing.paddingBeforeMin,
            paddingAfterMin: existing.paddingAfterMin,
            capacity: existing.capacity,
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
      const existing = await appointmentTypeRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      await appointmentTypeRepository.delete(tx, id);

      await events.appointmentTypeDeleted(
        orgId,
        {
          appointmentTypeId: id,
          name: existing.name,
          durationMin: existing.durationMin,
        },
        tx,
      );

      return { success: true };
    });
  }

  async linkCalendar(
    id: string,
    input: LinkCalendarInput,
  ): Promise<{ success: true }> {
    // Verify appointment type exists
    const appointmentTypeExists = await withRls((tx) =>
      appointmentTypeRepository.findById(tx, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify calendar exists and belongs to org
    const calendarExists = await withRls((tx) =>
      appointmentTypeRepository.verifyCalendarAccess(tx, input.calendarId),
    );
    if (!calendarExists) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    await withRls((tx) =>
      appointmentTypeRepository.linkCalendar(tx, id, input.calendarId),
    );

    return { success: true };
  }

  async unlinkCalendar(
    id: string,
    input: UnlinkCalendarInput,
  ): Promise<{ success: true }> {
    // Verify appointment type exists
    const appointmentTypeExists = await withRls((tx) =>
      appointmentTypeRepository.findById(tx, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const unlinked = await withRls((tx) =>
      appointmentTypeRepository.unlinkCalendar(tx, id, input.calendarId),
    );

    if (!unlinked) {
      throw new ApplicationError("Calendar link not found", {
        code: "NOT_FOUND",
      });
    }

    return { success: true };
  }

  async linkResource(
    id: string,
    input: LinkResourceInput,
  ): Promise<{ success: true }> {
    // Verify appointment type exists
    const appointmentTypeExists = await withRls((tx) =>
      appointmentTypeRepository.findById(tx, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify resource exists and belongs to org
    const resourceExists = await withRls((tx) =>
      appointmentTypeRepository.verifyResourceAccess(tx, input.resourceId),
    );
    if (!resourceExists) {
      throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
    }

    await withRls((tx) =>
      appointmentTypeRepository.linkResource(
        tx,
        id,
        input.resourceId,
        input.quantityRequired ?? 1,
      ),
    );

    return { success: true };
  }

  async unlinkResource(
    id: string,
    input: UnlinkResourceInput,
  ): Promise<{ success: true }> {
    // Verify appointment type exists
    const appointmentTypeExists = await withRls((tx) =>
      appointmentTypeRepository.findById(tx, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const unlinked = await withRls((tx) =>
      appointmentTypeRepository.unlinkResource(tx, id, input.resourceId),
    );

    if (!unlinked) {
      throw new ApplicationError("Resource link not found", {
        code: "NOT_FOUND",
      });
    }

    return { success: true };
  }
}

// Singleton instance
export const appointmentTypeService = new AppointmentTypeService();
