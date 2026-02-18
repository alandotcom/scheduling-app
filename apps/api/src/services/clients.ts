// Client service - business logic layer for clients

import {
  getCountries,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { clientRepository } from "../repositories/clients.js";
import type {
  ClientCreateInput as RepositoryClientCreateInput,
  ClientUpdateInput as RepositoryClientUpdateInput,
  Client,
  ClientListInput,
  ClientWithRelationshipCounts,
} from "../repositories/clients.js";
import type { PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import type { ServiceContext } from "./locations.js";
import type {
  ClientHistorySummary,
  CreateClientInput,
  UpdateClientInput,
} from "@scheduling/dto";

const UNIQUE_CONSTRAINT_VIOLATION = "23505";
const CLIENT_EMAIL_UNIQUE_CONSTRAINT = "clients_org_email_unique_idx";
const CLIENT_PHONE_UNIQUE_CONSTRAINT = "clients_org_phone_unique_idx";
const CLIENT_REFERENCE_ID_UNIQUE_CONSTRAINT =
  "clients_org_reference_id_unique_idx";
const DEFAULT_PHONE_COUNTRY: CountryCode = "US";
const PHONE_COUNTRIES = getCountries();

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("errno" in cause && cause.errno === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
    if ("code" in cause && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
}

function getConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("constraint" in cause && typeof cause.constraint === "string") {
      return cause.constraint;
    }
  }

  return null;
}

function mapClientWriteError(error: unknown): ApplicationError | null {
  if (!isUniqueConstraintViolation(error)) return null;

  const constraint = getConstraintName(error);
  if (constraint === CLIENT_EMAIL_UNIQUE_CONSTRAINT) {
    return new ApplicationError(
      "Client email already exists in this organization",
      {
        code: "DUPLICATE_ENTRY",
        details: { field: "email" },
      },
    );
  }

  if (constraint === CLIENT_PHONE_UNIQUE_CONSTRAINT) {
    return new ApplicationError(
      "Client phone already exists in this organization",
      {
        code: "DUPLICATE_ENTRY",
        details: { field: "phone" },
      },
    );
  }

  if (constraint === CLIENT_REFERENCE_ID_UNIQUE_CONSTRAINT) {
    return new ApplicationError(
      "Client reference ID already exists in this organization",
      {
        code: "DUPLICATE_ENTRY",
        details: { field: "referenceId" },
      },
    );
  }

  return new ApplicationError("Client contact already exists", {
    code: "DUPLICATE_ENTRY",
  });
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;

  const trimmed = email.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePhoneCountry(phoneCountry?: string): CountryCode {
  if (!phoneCountry) return DEFAULT_PHONE_COUNTRY;

  const normalized = phoneCountry.trim().toUpperCase();
  const countryCode = PHONE_COUNTRIES.find((country) => country === normalized);
  if (!countryCode) {
    throw new ApplicationError("Invalid phone country code", {
      code: "BAD_REQUEST",
    });
  }

  return countryCode;
}

function normalizePhone(
  phone: string | null | undefined,
  phoneCountry?: string,
): string | null {
  if (phone == null) return null;

  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;

  try {
    const parsed = trimmed.startsWith("+")
      ? parsePhoneNumberFromString(trimmed)
      : parsePhoneNumberFromString(
          trimmed,
          normalizePhoneCountry(phoneCountry),
        );

    if (!parsed || !parsed.isValid()) {
      throw new ApplicationError(
        "Invalid phone number format. Use a valid phone number.",
        {
          code: "BAD_REQUEST",
        },
      );
    }

    return parsed.number;
  } catch {
    throw new ApplicationError(
      "Invalid phone number format. Use a valid phone number.",
      {
        code: "BAD_REQUEST",
      },
    );
  }
}

function normalizeReferenceId(
  referenceId: string | null | undefined,
): string | null {
  if (referenceId == null) return null;

  const trimmed = referenceId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCreateInput(
  input: CreateClientInput,
): RepositoryClientCreateInput {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone, input.phoneCountry),
    referenceId: normalizeReferenceId(input.referenceId),
  };
}

function normalizeUpdateInput(
  input: UpdateClientInput,
): RepositoryClientUpdateInput {
  const normalized: RepositoryClientUpdateInput = {};

  if (input.firstName !== undefined) normalized.firstName = input.firstName;
  if (input.lastName !== undefined) normalized.lastName = input.lastName;
  if (input.email !== undefined) normalized.email = normalizeEmail(input.email);
  if (input.phone !== undefined) {
    normalized.phone = normalizePhone(input.phone, input.phoneCountry);
  }
  if (input.referenceId !== undefined) {
    normalized.referenceId = normalizeReferenceId(input.referenceId);
  }

  return normalized;
}

export class ClientService {
  async list(
    input: ClientListInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<ClientWithRelationshipCounts>> {
    return withOrg(context.orgId, (tx) =>
      clientRepository.findMany(tx, context.orgId, input),
    );
  }

  async get(id: string, context: ServiceContext): Promise<Client> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findById(tx, context.orgId, id);

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      return client;
    });
  }

  async getByReferenceId(
    referenceId: string,
    context: ServiceContext,
  ): Promise<Client> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findByReferenceId(
        tx,
        context.orgId,
        referenceId,
      );

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      return client;
    });
  }

  async create(
    input: CreateClientInput,
    context: ServiceContext,
  ): Promise<Client> {
    const client = await withOrg(context.orgId, async (tx) => {
      const normalizedInput = normalizeCreateInput(input);

      let client: Client;
      try {
        client = await clientRepository.create(
          tx,
          context.orgId,
          normalizedInput,
        );
      } catch (error: unknown) {
        const mappedError = mapClientWriteError(error);
        if (mappedError) throw mappedError;
        throw error;
      }

      return client;
    });

    await events.clientCreated(context.orgId, {
      clientId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
    });

    return client;
  }

  async update(
    id: string,
    data: UpdateClientInput,
    context: ServiceContext,
  ): Promise<Client> {
    const { existing, updated } = await withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await clientRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const normalizedChanges = normalizeUpdateInput(data);

      let updated: Client | null;
      try {
        updated = await clientRepository.update(
          tx,
          context.orgId,
          id,
          normalizedChanges,
        );
      } catch (error: unknown) {
        const mappedError = mapClientWriteError(error);
        if (mappedError) throw mappedError;
        throw error;
      }

      if (!updated) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      return { existing, updated };
    });

    await events.clientUpdated(context.orgId, {
      clientId: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      previous: {
        clientId: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
      },
    });

    return updated;
  }

  async updateByReferenceId(
    referenceId: string,
    data: UpdateClientInput,
    context: ServiceContext,
  ): Promise<Client> {
    const { existing, updated } = await withOrg(context.orgId, async (tx) => {
      const existing = await clientRepository.findByReferenceId(
        tx,
        context.orgId,
        referenceId,
      );

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const normalizedChanges = normalizeUpdateInput(data);

      let updated: Client | null;
      try {
        updated = await clientRepository.updateByReferenceId(
          tx,
          context.orgId,
          referenceId,
          normalizedChanges,
        );
      } catch (error: unknown) {
        const mappedError = mapClientWriteError(error);
        if (mappedError) throw mappedError;
        throw error;
      }

      if (!updated) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      return { existing, updated };
    });

    await events.clientUpdated(context.orgId, {
      clientId: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      previous: {
        clientId: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
      },
    });

    return updated;
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const deleted = await withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await clientRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      await clientRepository.delete(tx, context.orgId, id);

      return {
        clientId: id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
      };
    });

    await events.clientDeleted(context.orgId, deleted);

    return { success: true };
  }

  async deleteByReferenceId(
    referenceId: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const deleted = await withOrg(context.orgId, async (tx) => {
      const existing = await clientRepository.findByReferenceId(
        tx,
        context.orgId,
        referenceId,
      );

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      await clientRepository.deleteByReferenceId(
        tx,
        context.orgId,
        referenceId,
      );

      return {
        clientId: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
      };
    });

    await events.clientDeleted(context.orgId, deleted);

    return { success: true };
  }

  async historySummary(
    id: string,
    context: ServiceContext,
  ): Promise<ClientHistorySummary> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findById(tx, context.orgId, id);

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const summary = await clientRepository.getHistorySummary(
        tx,
        context.orgId,
        id,
      );

      return {
        clientId: id,
        ...summary,
      };
    });
  }

  async historySummaryByReferenceId(
    referenceId: string,
    context: ServiceContext,
  ): Promise<ClientHistorySummary> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findByReferenceId(
        tx,
        context.orgId,
        referenceId,
      );

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const summary = await clientRepository.getHistorySummary(
        tx,
        context.orgId,
        client.id,
      );

      return {
        clientId: client.id,
        ...summary,
      };
    });
  }
}

// Singleton instance
export const clientService = new ClientService();
