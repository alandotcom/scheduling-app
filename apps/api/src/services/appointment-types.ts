// Appointment type service - business logic layer for appointment types

import { appointmentTypeRepository } from "../repositories/appointment-types.js";
import type {
  AppointmentTypeCreateInput,
  AppointmentTypeUpdateInput,
  AppointmentType,
  AppointmentTypeWithRelationshipCounts,
  AppointmentTypeWithLinks,
  CalendarAssociation,
  ResourceAssociation,
  CalendarAssociationRecord,
  ResourceAssociationRecord,
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

export interface UpdateResourceInput {
  resourceId: string;
  quantityRequired: number;
}

export class AppointmentTypeService {
  async list(
    input: PaginationInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<AppointmentTypeWithRelationshipCounts>> {
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

  async listCalendars(
    id: string,
    context: ServiceContext,
  ): Promise<CalendarAssociation[]> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      return appointmentTypeRepository.getLinkedCalendars(tx, orgId, id);
    });
  }

  async linkCalendar(
    id: string,
    input: LinkCalendarInput,
    context: ServiceContext,
  ): Promise<CalendarAssociationRecord> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Verify appointment type exists
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      // Verify calendar exists and belongs to org
      const calendarExists =
        await appointmentTypeRepository.verifyCalendarAccess(
          tx,
          orgId,
          input.calendarId,
        );
      if (!calendarExists) {
        throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
      }

      // Check for existing association
      const existing = await appointmentTypeRepository.findCalendarLink(
        tx,
        id,
        input.calendarId,
      );
      if (existing) {
        throw new ApplicationError(
          "Calendar already associated with appointment type",
          { code: "CONFLICT" },
        );
      }

      return appointmentTypeRepository.linkCalendar(tx, id, input.calendarId);
    });
  }

  async unlinkCalendar(
    id: string,
    input: UnlinkCalendarInput,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Verify appointment type exists
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      const unlinked = await appointmentTypeRepository.unlinkCalendar(
        tx,
        id,
        input.calendarId,
      );

      if (!unlinked) {
        throw new ApplicationError("Calendar link not found", {
          code: "NOT_FOUND",
        });
      }

      return { success: true };
    });
  }

  async listResources(
    id: string,
    context: ServiceContext,
  ): Promise<ResourceAssociation[]> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      return appointmentTypeRepository.getLinkedResources(tx, orgId, id);
    });
  }

  async linkResource(
    id: string,
    input: LinkResourceInput,
    context: ServiceContext,
  ): Promise<ResourceAssociationRecord> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Verify appointment type exists
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      // Verify resource exists and belongs to org
      const resourceExists =
        await appointmentTypeRepository.verifyResourceAccess(
          tx,
          orgId,
          input.resourceId,
        );
      if (!resourceExists) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      // Check for existing association
      const existing = await appointmentTypeRepository.findResourceLink(
        tx,
        id,
        input.resourceId,
      );
      if (existing) {
        throw new ApplicationError(
          "Resource already associated with appointment type",
          { code: "CONFLICT" },
        );
      }

      return appointmentTypeRepository.linkResource(
        tx,
        id,
        input.resourceId,
        input.quantityRequired ?? 1,
      );
    });
  }

  async updateResource(
    id: string,
    input: UpdateResourceInput,
    context: ServiceContext,
  ): Promise<ResourceAssociationRecord> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Verify appointment type exists
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      const updated = await appointmentTypeRepository.updateResourceLink(
        tx,
        id,
        input.resourceId,
        input.quantityRequired,
      );

      if (!updated) {
        throw new ApplicationError("Resource link not found", {
          code: "NOT_FOUND",
        });
      }

      // Return the updated association record
      const result = await appointmentTypeRepository.findResourceLink(
        tx,
        id,
        input.resourceId,
      );
      return result!;
    });
  }

  async unlinkResource(
    id: string,
    input: UnlinkResourceInput,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Verify appointment type exists
      const appointmentType = await appointmentTypeRepository.findById(
        tx,
        orgId,
        id,
      );
      if (!appointmentType) {
        throw new ApplicationError("Appointment type not found", {
          code: "NOT_FOUND",
        });
      }

      const unlinked = await appointmentTypeRepository.unlinkResource(
        tx,
        id,
        input.resourceId,
      );

      if (!unlinked) {
        throw new ApplicationError("Resource link not found", {
          code: "NOT_FOUND",
        });
      }

      return { success: true };
    });
  }
}

// Singleton instance
export const appointmentTypeService = new AppointmentTypeService();
