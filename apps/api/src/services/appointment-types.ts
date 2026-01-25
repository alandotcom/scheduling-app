// Appointment type service - business logic layer for appointment types

import { appointmentTypeRepository } from "../repositories/appointment-types.js";
import type {
  AppointmentTypeCreateInput,
  AppointmentTypeUpdateInput,
  AppointmentType,
  AppointmentTypeWithLinks,
} from "../repositories/appointment-types.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import type { ServiceContext } from "./locations.js";

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
    context: ServiceContext,
  ): Promise<PaginatedResult<AppointmentType>> {
    return withOrg(context.orgId, (tx) =>
      appointmentTypeRepository.findMany(tx, context.orgId, input),
    );
  }

  async get(
    id: string,
    context: ServiceContext,
  ): Promise<ReturnType<typeof toAppointmentTypeResponse>> {
    return withOrg(context.orgId, async (tx) => {
      const result = await appointmentTypeRepository.findByIdWithLinks(
        tx,
        context.orgId,
        id,
      );

      if (!result) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      return toAppointmentTypeResponse(result);
    });
  }

  async create(
    input: AppointmentTypeCreateInput,
    context: ServiceContext,
  ): Promise<AppointmentType> {
    return withOrg(context.orgId, async (tx) => {
      const appointmentType = await appointmentTypeRepository.create(
        tx,
        context.orgId,
        input,
      );

      await events.appointmentTypeCreated(
        context.orgId,
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
    context: ServiceContext,
  ): Promise<AppointmentType> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await appointmentTypeRepository.findById(
        tx,
        context.orgId,
        id,
      );

      if (!existing) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      const updated = await appointmentTypeRepository.update(
        tx,
        context.orgId,
        id,
        data,
      );

      if (!updated) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      await events.appointmentTypeUpdated(
        context.orgId,
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

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await appointmentTypeRepository.findById(
        tx,
        context.orgId,
        id,
      );

      if (!existing) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      await appointmentTypeRepository.delete(tx, context.orgId, id);

      await events.appointmentTypeDeleted(
        context.orgId,
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
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const { orgId } = context;

    // Verify appointment type exists
    const appointmentTypeExists = await withOrg(orgId, (tx) =>
      appointmentTypeRepository.findById(tx, orgId, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify calendar exists and belongs to org
    const calendarExists = await withOrg(orgId, (tx) =>
      appointmentTypeRepository.verifyCalendarAccess(tx, orgId, input.calendarId),
    );
    if (!calendarExists) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    await withOrg(orgId, (tx) =>
      appointmentTypeRepository.linkCalendar(tx, id, input.calendarId),
    );

    return { success: true };
  }

  async unlinkCalendar(
    id: string,
    input: UnlinkCalendarInput,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const { orgId } = context;

    // Verify appointment type exists
    const appointmentTypeExists = await withOrg(orgId, (tx) =>
      appointmentTypeRepository.findById(tx, orgId, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const unlinked = await withOrg(orgId, (tx) =>
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
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const { orgId } = context;

    // Verify appointment type exists
    const appointmentTypeExists = await withOrg(orgId, (tx) =>
      appointmentTypeRepository.findById(tx, orgId, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify resource exists and belongs to org
    const resourceExists = await withOrg(orgId, (tx) =>
      appointmentTypeRepository.verifyResourceAccess(tx, orgId, input.resourceId),
    );
    if (!resourceExists) {
      throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
    }

    await withOrg(orgId, (tx) =>
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
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const { orgId } = context;

    // Verify appointment type exists
    const appointmentTypeExists = await withOrg(orgId, (tx) =>
      appointmentTypeRepository.findById(tx, orgId, id),
    );
    if (!appointmentTypeExists) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const unlinked = await withOrg(orgId, (tx) =>
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
