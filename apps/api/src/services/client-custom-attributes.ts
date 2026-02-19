import { retry } from "es-toolkit/function";
import type {
  CustomAttributeType,
  SlotUsage,
  CustomAttributeValues as CustomAttributeValueMap,
  CreateCustomAttributeDefinitionInput,
  UpdateCustomAttributeDefinitionInput,
} from "@scheduling/dto";
import {
  SLOT_PREFIX_BY_TYPE,
  SLOT_COUNT_BY_PREFIX,
  isSlotColumn,
  isSlotPrefix,
  type SlotColumn,
  type SlotPrefix,
} from "../lib/slot-config.js";
import {
  customAttributeRepository,
  type CustomAttributeDefinition,
  type ValidatedDefinition,
  type CustomAttributeValues,
} from "../repositories/custom-attributes.js";
import { withOrg } from "../lib/db.js";
import { isUniqueConstraintViolation } from "../lib/db-errors.js";
import { ApplicationError } from "../errors/application-error.js";
import type { ServiceContext } from "./locations.js";
import type { DbClient } from "../lib/db.js";

// ─── Slot mapping helpers ───

function findFreeSlot(
  definitions: ValidatedDefinition[],
  type: CustomAttributeType,
): SlotColumn {
  const prefix = SLOT_PREFIX_BY_TYPE[type];
  const maxCount = SLOT_COUNT_BY_PREFIX[prefix];
  const usedSlots = new Set<string>(
    definitions
      .filter((d) => d.slotColumn.startsWith(prefix))
      .map((d) => d.slotColumn),
  );

  for (let i = 0; i < maxCount; i++) {
    const candidate = `${prefix}${i}`;
    if (!usedSlots.has(candidate) && isSlotColumn(candidate)) return candidate;
  }

  throw new ApplicationError(
    `No available slots for type ${type}. Maximum ${maxCount} attributes of this type allowed.`,
    { code: "UNPROCESSABLE_CONTENT" },
  );
}

function mapFromSlots(
  definitions: ValidatedDefinition[],
  row: CustomAttributeValues,
): CustomAttributeValueMap {
  const result: CustomAttributeValueMap = {};
  for (const def of definitions) {
    const raw = row[def.slotColumn];
    if (raw === null || raw === undefined) {
      result[def.fieldKey] = null;
      continue;
    }

    switch (def.type) {
      case "NUMBER":
        result[def.fieldKey] = Number(raw);
        break;
      case "BOOLEAN":
        result[def.fieldKey] = Boolean(raw);
        break;
      case "DATE":
        result[def.fieldKey] =
          raw instanceof Date
            ? raw.toISOString()
            : typeof raw === "string"
              ? raw
              : null;
        break;
      case "MULTI_SELECT":
        result[def.fieldKey] = Array.isArray(raw) ? raw : [];
        break;
      default:
        result[def.fieldKey] =
          typeof raw === "string" ? raw : JSON.stringify(raw);
    }
  }
  return result;
}

function mapToSlots(
  definitions: ValidatedDefinition[],
  values: Record<string, unknown>,
  options?: { enforceRequired?: boolean },
): Partial<Record<SlotColumn, unknown>> {
  const slots: Partial<Record<SlotColumn, unknown>> = {};
  const defByKey = new Map(definitions.map((d) => [d.fieldKey, d]));

  for (const [fieldKey, value] of Object.entries(values)) {
    const def = defByKey.get(fieldKey);
    if (!def) {
      throw new ApplicationError(`Unknown custom attribute: ${fieldKey}`, {
        code: "BAD_REQUEST",
        details: { field: fieldKey },
      });
    }

    if (value === null) {
      slots[def.slotColumn] = null;
      continue;
    }

    switch (def.type) {
      case "TEXT":
      case "SELECT":
        if (typeof value !== "string") {
          throw new ApplicationError(
            `Custom attribute "${fieldKey}" must be a string`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        if (
          def.type === "SELECT" &&
          def.options &&
          !def.options.includes(value)
        ) {
          throw new ApplicationError(
            `Invalid option "${value}" for "${fieldKey}". Valid options: ${def.options.join(", ")}`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        slots[def.slotColumn] = value;
        break;
      case "NUMBER":
        if (typeof value !== "number") {
          throw new ApplicationError(
            `Custom attribute "${fieldKey}" must be a number`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        slots[def.slotColumn] = String(value);
        break;
      case "DATE": {
        let parsed: Date;
        if (value instanceof Date) {
          parsed = value;
        } else if (typeof value === "string") {
          parsed = new Date(value);
        } else {
          throw new ApplicationError(
            `Custom attribute "${fieldKey}" must be a date string or Date`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        if (Number.isNaN(parsed.getTime())) {
          throw new ApplicationError(
            `Custom attribute "${fieldKey}" has an invalid date value`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        slots[def.slotColumn] = parsed;
        break;
      }
      case "BOOLEAN":
        if (typeof value !== "boolean") {
          throw new ApplicationError(
            `Custom attribute "${fieldKey}" must be a boolean`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        slots[def.slotColumn] = value;
        break;
      case "MULTI_SELECT":
        if (!Array.isArray(value)) {
          throw new ApplicationError(
            `Custom attribute "${fieldKey}" must be an array of strings`,
            { code: "BAD_REQUEST", details: { field: fieldKey } },
          );
        }
        if (def.options) {
          const invalid = value.filter(
            (v: unknown) => typeof v !== "string" || !def.options!.includes(v),
          );
          if (invalid.length > 0) {
            throw new ApplicationError(
              `Invalid options for "${fieldKey}": ${invalid.join(", ")}`,
              { code: "BAD_REQUEST", details: { field: fieldKey } },
            );
          }
        }
        slots[def.slotColumn] = value;
        break;
    }
  }

  // Validate required fields
  for (const def of definitions) {
    if (!def.required) continue;

    if (options?.enforceRequired) {
      // Create mode: required field must be present and non-null
      const value = values[def.fieldKey];
      if (!(def.fieldKey in values) || value === null || value === undefined) {
        throw new ApplicationError(
          `Custom attribute "${def.fieldKey}" is required`,
          { code: "BAD_REQUEST", details: { field: def.fieldKey } },
        );
      }
    } else if (def.fieldKey in values) {
      // Update mode: only validate if explicitly included
      const value = values[def.fieldKey];
      if (value === null || value === undefined) {
        throw new ApplicationError(
          `Custom attribute "${def.fieldKey}" is required`,
          { code: "BAD_REQUEST", details: { field: def.fieldKey } },
        );
      }
    }
  }

  return slots;
}

// ─── Service ───

export class ClientCustomAttributeService {
  async listDefinitions(
    context: ServiceContext,
  ): Promise<CustomAttributeDefinition[]> {
    return withOrg(context.orgId, (tx) =>
      customAttributeRepository.listDefinitions(tx, context.orgId),
    );
  }

  async createDefinition(
    input: CreateCustomAttributeDefinitionInput,
    context: ServiceContext,
  ): Promise<CustomAttributeDefinition> {
    return retry(
      () =>
        withOrg(context.orgId, async (tx) => {
          const existing =
            await customAttributeRepository.findDefinitionByFieldKey(
              tx,
              context.orgId,
              input.fieldKey,
            );
          if (existing) {
            throw new ApplicationError(
              `Custom attribute "${input.fieldKey}" already exists`,
              { code: "DUPLICATE_ENTRY", details: { field: "fieldKey" } },
            );
          }

          const definitions = await customAttributeRepository.listDefinitions(
            tx,
            context.orgId,
          );
          const slotColumn = findFreeSlot(definitions, input.type);

          return customAttributeRepository.createDefinition(tx, context.orgId, {
            fieldKey: input.fieldKey,
            label: input.label,
            type: input.type,
            slotColumn,
            required: input.required ?? false,
            options: input.options ?? null,
            displayOrder: input.displayOrder ?? 0,
          });
        }),
      { retries: 3, shouldRetry: isUniqueConstraintViolation },
    );
  }

  async updateDefinition(
    id: string,
    input: UpdateCustomAttributeDefinitionInput,
    context: ServiceContext,
  ): Promise<CustomAttributeDefinition> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await customAttributeRepository.findDefinitionById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Custom attribute definition not found", {
          code: "NOT_FOUND",
        });
      }

      const updateData: Partial<
        Pick<
          CustomAttributeDefinition,
          "label" | "required" | "options" | "displayOrder"
        >
      > = {};
      if (input.label !== undefined) updateData.label = input.label;
      if (input.required !== undefined) updateData.required = input.required;
      if (input.options !== undefined) updateData.options = input.options;
      if (input.displayOrder !== undefined)
        updateData.displayOrder = input.displayOrder;

      const result = await customAttributeRepository.updateDefinition(
        tx,
        context.orgId,
        id,
        updateData,
      );
      if (!result) {
        throw new ApplicationError("Custom attribute definition not found", {
          code: "NOT_FOUND",
        });
      }
      return result;
    });
  }

  async deleteDefinition(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    await withOrg(context.orgId, async (tx) => {
      const existing = await customAttributeRepository.findDefinitionById(
        tx,
        context.orgId,
        id,
      );
      if (!existing) {
        throw new ApplicationError("Custom attribute definition not found", {
          code: "NOT_FOUND",
        });
      }
      // Clear orphaned slot data before deleting the definition
      await customAttributeRepository.clearSlotColumn(
        tx,
        context.orgId,
        existing.slotColumn,
      );
      await customAttributeRepository.deleteDefinition(tx, context.orgId, id);
    });
    return { success: true };
  }

  async getSlotUsage(context: ServiceContext): Promise<SlotUsage> {
    return withOrg(context.orgId, async (tx) => {
      const definitions = await customAttributeRepository.listDefinitions(
        tx,
        context.orgId,
      );

      const countByPrefix: Record<SlotPrefix, number> = {
        t: 0,
        n: 0,
        d: 0,
        b: 0,
        j: 0,
      };
      for (const def of definitions) {
        const prefix = def.slotColumn.charAt(0);
        if (isSlotPrefix(prefix)) {
          countByPrefix[prefix] += 1;
        }
      }

      return {
        t: { used: countByPrefix["t"], total: SLOT_COUNT_BY_PREFIX["t"] },
        n: { used: countByPrefix["n"], total: SLOT_COUNT_BY_PREFIX["n"] },
        d: { used: countByPrefix["d"], total: SLOT_COUNT_BY_PREFIX["d"] },
        b: { used: countByPrefix["b"], total: SLOT_COUNT_BY_PREFIX["b"] },
        j: { used: countByPrefix["j"], total: SLOT_COUNT_BY_PREFIX["j"] },
      };
    });
  }

  async writeValues(
    tx: DbClient,
    orgId: string,
    clientId: string,
    values: Record<string, unknown>,
    options?: { enforceRequired?: boolean },
  ): Promise<ValidatedDefinition[]> {
    const definitions = await customAttributeRepository.listDefinitions(
      tx,
      orgId,
    );
    if (definitions.length === 0 && Object.keys(values).length > 0) {
      throw new ApplicationError(
        "No custom attributes defined for this organization",
        { code: "BAD_REQUEST" },
      );
    }
    if (definitions.length === 0) {
      return definitions;
    }

    const slotUpdates = mapToSlots(definitions, values, options);
    if (Object.keys(slotUpdates).length > 0) {
      await customAttributeRepository.upsertValues(
        tx,
        orgId,
        clientId,
        slotUpdates,
      );
    }
    return definitions;
  }

  async loadClientCustomAttributes(
    tx: DbClient,
    orgId: string,
    clientId: string,
  ): Promise<CustomAttributeValueMap> {
    const [definitions, valuesRow] = await Promise.all([
      customAttributeRepository.listDefinitions(tx, orgId),
      customAttributeRepository.getValues(tx, orgId, clientId),
    ]);

    return this.buildAttributeMap(definitions, valuesRow);
  }

  async loadClientCustomAttributesFromDefs(
    tx: DbClient,
    orgId: string,
    clientId: string,
    definitions: ValidatedDefinition[],
  ): Promise<CustomAttributeValueMap> {
    if (definitions.length === 0) return {};
    const valuesRow = await customAttributeRepository.getValues(
      tx,
      orgId,
      clientId,
    );
    return this.buildAttributeMap(definitions, valuesRow);
  }

  private buildAttributeMap(
    definitions: ValidatedDefinition[],
    valuesRow: CustomAttributeValues | null,
  ): CustomAttributeValueMap {
    if (definitions.length === 0) return {};
    if (!valuesRow) {
      const result: CustomAttributeValueMap = {};
      for (const def of definitions) {
        result[def.fieldKey] = null;
      }
      return result;
    }
    return mapFromSlots(definitions, valuesRow);
  }
}

export const clientCustomAttributeService = new ClientCustomAttributeService();
