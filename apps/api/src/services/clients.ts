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
  CustomAttributeValues,
} from "@scheduling/dto";
import { clientCustomAttributeService } from "./client-custom-attributes.js";
import type { ValidatedDefinition } from "../repositories/custom-attributes.js";
import {
  isUniqueConstraintViolation,
  getConstraintName,
} from "../lib/db-errors.js";

const CLIENT_EMAIL_UNIQUE_CONSTRAINT = "clients_org_email_unique_idx";
const CLIENT_PHONE_UNIQUE_CONSTRAINT = "clients_org_phone_unique_idx";
const CLIENT_REFERENCE_ID_UNIQUE_CONSTRAINT =
  "clients_org_reference_id_unique_idx";
const DEFAULT_PHONE_COUNTRY: CountryCode = "US";
const PHONE_COUNTRIES = getCountries();

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

type ClientWithCustomAttributes = Client & {
  customAttributes: CustomAttributeValues;
};

export class ClientService {
  async list(
    input: ClientListInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<ClientWithRelationshipCounts>> {
    return withOrg(context.orgId, (tx) =>
      clientRepository.findMany(tx, context.orgId, input),
    );
  }

  async getByIds(ids: string[], context: ServiceContext): Promise<Client[]> {
    return withOrg(context.orgId, async (tx) => {
      const dedupedIds = Array.from(new Set(ids));
      if (dedupedIds.length === 0) {
        return [];
      }

      const foundClients = await clientRepository.findByIds(
        tx,
        context.orgId,
        dedupedIds,
      );
      const indexById = new Map(
        dedupedIds.map((clientId, index) => [clientId, index]),
      );

      return foundClients.toSorted(
        (a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0),
      );
    });
  }

  async get(
    id: string,
    context: ServiceContext,
  ): Promise<ClientWithCustomAttributes> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findById(tx, context.orgId, id);

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const customAttributes =
        await clientCustomAttributeService.loadClientCustomAttributes(
          tx,
          context.orgId,
          id,
        );

      return { ...client, customAttributes };
    });
  }

  async getByReferenceId(
    referenceId: string,
    context: ServiceContext,
  ): Promise<ClientWithCustomAttributes> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findByReferenceId(
        tx,
        context.orgId,
        referenceId,
      );

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const customAttributes =
        await clientCustomAttributeService.loadClientCustomAttributes(
          tx,
          context.orgId,
          client.id,
        );

      return { ...client, customAttributes };
    });
  }

  async create(
    input: CreateClientInput,
    context: ServiceContext,
  ): Promise<ClientWithCustomAttributes> {
    const { customAttributes: customAttrsInput, ...coreInput } = input;

    const { client, customAttributes } = await withOrg(
      context.orgId,
      async (tx) => {
        const normalizedInput = normalizeCreateInput(coreInput);

        let createdClient: Client;
        try {
          createdClient = await clientRepository.create(
            tx,
            context.orgId,
            normalizedInput,
          );
        } catch (error: unknown) {
          const mappedError = mapClientWriteError(error);
          if (mappedError) throw mappedError;
          throw error;
        }

        const defs = await clientCustomAttributeService.writeValues(
          tx,
          context.orgId,
          createdClient.id,
          customAttrsInput ?? {},
          { enforceRequired: true },
        );

        const createdCustomAttributes =
          await clientCustomAttributeService.loadClientCustomAttributesFromDefs(
            tx,
            context.orgId,
            createdClient.id,
            defs,
          );

        return {
          client: createdClient,
          customAttributes: createdCustomAttributes,
        };
      },
    );

    await events.clientCreated(context.orgId, {
      clientId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      phone: client.phone,
      customAttributes,
    });

    return { ...client, customAttributes };
  }

  async update(
    id: string,
    data: UpdateClientInput,
    context: ServiceContext,
  ): Promise<ClientWithCustomAttributes> {
    const { customAttributes: customAttrsInput, ...coreData } = data;

    const { existing, updated, previousCustomAttributes, customAttributes } =
      await withOrg(context.orgId, async (tx) => {
        const existingClient = await clientRepository.findById(
          tx,
          context.orgId,
          id,
        );

        if (!existingClient) {
          throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
        }

        const previousCustomAttributesRecord =
          await clientCustomAttributeService.loadClientCustomAttributes(
            tx,
            context.orgId,
            id,
          );

        const normalizedChanges = normalizeUpdateInput(coreData);

        let updatedClient: Client | null;
        try {
          updatedClient = await clientRepository.update(
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

        if (!updatedClient) {
          throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
        }

        let defs: ValidatedDefinition[] | null = null;
        if (customAttrsInput && Object.keys(customAttrsInput).length > 0) {
          defs = await clientCustomAttributeService.writeValues(
            tx,
            context.orgId,
            id,
            customAttrsInput,
          );
        }

        const updatedCustomAttributes = defs
          ? await clientCustomAttributeService.loadClientCustomAttributesFromDefs(
              tx,
              context.orgId,
              id,
              defs,
            )
          : await clientCustomAttributeService.loadClientCustomAttributes(
              tx,
              context.orgId,
              id,
            );

        return {
          existing: existingClient,
          updated: updatedClient,
          previousCustomAttributes: previousCustomAttributesRecord,
          customAttributes: updatedCustomAttributes,
        };
      });

    await events.clientUpdated(context.orgId, {
      clientId: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      customAttributes,
      previous: {
        clientId: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
        customAttributes: previousCustomAttributes,
      },
    });

    return { ...updated, customAttributes };
  }

  async updateByReferenceId(
    referenceId: string,
    data: UpdateClientInput,
    context: ServiceContext,
  ): Promise<ClientWithCustomAttributes> {
    const { customAttributes: customAttrsInput, ...coreData } = data;

    const { existing, updated, previousCustomAttributes, customAttributes } =
      await withOrg(context.orgId, async (tx) => {
        const existingClient = await clientRepository.findByReferenceId(
          tx,
          context.orgId,
          referenceId,
        );

        if (!existingClient) {
          throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
        }

        const previousCustomAttributesRecord =
          await clientCustomAttributeService.loadClientCustomAttributes(
            tx,
            context.orgId,
            existingClient.id,
          );

        const normalizedChanges = normalizeUpdateInput(coreData);

        let updatedClient: Client | null;
        try {
          updatedClient = await clientRepository.updateByReferenceId(
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

        if (!updatedClient) {
          throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
        }

        let defs: ValidatedDefinition[] | null = null;
        if (customAttrsInput && Object.keys(customAttrsInput).length > 0) {
          defs = await clientCustomAttributeService.writeValues(
            tx,
            context.orgId,
            updatedClient.id,
            customAttrsInput,
          );
        }

        const updatedCustomAttributes = defs
          ? await clientCustomAttributeService.loadClientCustomAttributesFromDefs(
              tx,
              context.orgId,
              updatedClient.id,
              defs,
            )
          : await clientCustomAttributeService.loadClientCustomAttributes(
              tx,
              context.orgId,
              updatedClient.id,
            );

        return {
          existing: existingClient,
          updated: updatedClient,
          previousCustomAttributes: previousCustomAttributesRecord,
          customAttributes: updatedCustomAttributes,
        };
      });

    await events.clientUpdated(context.orgId, {
      clientId: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      customAttributes,
      previous: {
        clientId: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
        customAttributes: previousCustomAttributes,
      },
    });

    return { ...updated, customAttributes };
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const deleted = await withOrg(context.orgId, async (tx) => {
      const existing = await clientRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const customAttributes =
        await clientCustomAttributeService.loadClientCustomAttributes(
          tx,
          context.orgId,
          id,
        );

      await clientRepository.delete(tx, context.orgId, id);

      return {
        clientId: id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
        customAttributes,
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

      const customAttributes =
        await clientCustomAttributeService.loadClientCustomAttributes(
          tx,
          context.orgId,
          existing.id,
        );

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
        customAttributes,
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
