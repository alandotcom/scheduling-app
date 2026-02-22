import { sql } from "drizzle-orm";
import { clientCustomAttributeDefinitions } from "@scheduling/db/schema";
import { compact, forEachAsync, uniq } from "es-toolkit/array";
import { retry } from "es-toolkit/function";
import { getLogger } from "@logtape/logtape";
import type {
  SlotUsage,
  CustomAttributeValues as CustomAttributeValueMap,
  CreateCustomAttributeDefinitionInput,
  UpdateCustomAttributeDefinitionInput,
  CustomAttributeDefinitionResponse,
} from "@scheduling/dto";
import {
  SLOT_PREFIX_BY_TYPE,
  SLOT_COUNT_BY_PREFIX,
  isSlotColumn,
  isSlotPrefix,
  type SlotColumn,
  type SlotPrefix,
  type SlotBackedCustomAttributeType,
} from "../lib/slot-config.js";
import {
  customAttributeRepository,
  type ValidatedDefinition,
  type CustomAttributeValues,
  type SlotBackedDefinition,
  type RelationDefinition,
} from "../repositories/custom-attributes.js";
import { withOrg } from "../lib/db.js";
import {
  isRelationWriteContentionError,
  isUniqueConstraintViolation,
} from "../lib/db-errors.js";
import { ApplicationError } from "../errors/application-error.js";
import type { ServiceContext } from "./locations.js";
import type { DbClient } from "../lib/db.js";

const logger = getLogger(["clients", "custom-attributes"]);

function isRelationDefinition(
  definition: ValidatedDefinition,
): definition is RelationDefinition {
  return definition.type === "RELATION_CLIENT";
}

function isSlotBackedDefinition(
  definition: ValidatedDefinition,
): definition is SlotBackedDefinition {
  return definition.type !== "RELATION_CLIENT";
}

function toDefinitionResponse(
  definition: ValidatedDefinition,
): CustomAttributeDefinitionResponse {
  return {
    id: definition.id,
    orgId: definition.orgId,
    fieldKey: definition.fieldKey,
    label: definition.label,
    type: definition.type,
    required: definition.required,
    options: definition.options,
    relationConfig: isRelationDefinition(definition)
      ? {
          targetEntity: definition.relationTargetEntity,
          valueMode: definition.relationValueMode,
          pairedDefinitionId: definition.pairedDefinitionId,
          pairedRole: definition.pairedRole,
        }
      : null,
    displayOrder: definition.displayOrder,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  };
}

// ─── Slot mapping helpers ───

function findFreeSlot(
  definitions: ValidatedDefinition[],
  type: SlotBackedCustomAttributeType,
): SlotColumn {
  const prefix = SLOT_PREFIX_BY_TYPE[type];
  const maxCount = SLOT_COUNT_BY_PREFIX[prefix];
  const usedSlots = new Set<string>(
    definitions.flatMap((definition) => {
      if (!isSlotBackedDefinition(definition)) return [];
      if (!definition.slotColumn.startsWith(prefix)) return [];
      return [definition.slotColumn];
    }),
  );

  for (let i = 0; i < maxCount; i += 1) {
    const candidate = `${prefix}${i}`;
    if (!usedSlots.has(candidate) && isSlotColumn(candidate)) {
      return candidate;
    }
  }

  throw new ApplicationError(
    `No available slots for type ${type}. Maximum ${maxCount} attributes of this type allowed.`,
    { code: "UNPROCESSABLE_CONTENT" },
  );
}

function mapFromSlots(
  definitions: SlotBackedDefinition[],
  row: CustomAttributeValues,
): CustomAttributeValueMap {
  const result: CustomAttributeValueMap = {};

  for (const definition of definitions) {
    const raw = row[definition.slotColumn];
    if (raw === null || raw === undefined) {
      result[definition.fieldKey] = null;
      continue;
    }

    switch (definition.type) {
      case "NUMBER":
        result[definition.fieldKey] = Number(raw);
        break;
      case "BOOLEAN":
        result[definition.fieldKey] = Boolean(raw);
        break;
      case "DATE":
        result[definition.fieldKey] =
          raw instanceof Date
            ? raw.toISOString()
            : typeof raw === "string"
              ? raw
              : null;
        break;
      case "MULTI_SELECT":
        result[definition.fieldKey] = Array.isArray(raw) ? raw : [];
        break;
      default:
        result[definition.fieldKey] =
          typeof raw === "string" ? raw : JSON.stringify(raw);
    }
  }

  return result;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseRelationTargets(input: {
  definition: RelationDefinition;
  fieldKey: string;
  value: unknown;
  sourceClientId: string;
}): string[] {
  const { definition, fieldKey, value, sourceClientId } = input;

  if (value === null || value === undefined) {
    return [];
  }

  const targetIds =
    typeof value === "string" ? [value] : Array.isArray(value) ? value : null;

  if (
    !targetIds ||
    !targetIds.every((item): item is string => {
      return typeof item === "string" && item.length > 0;
    })
  ) {
    throw new ApplicationError(
      `Custom attribute "${fieldKey}" must contain only non-empty client IDs`,
      { code: "BAD_REQUEST", details: { field: fieldKey } },
    );
  }

  const dedupedTargets = uniq(targetIds);

  const invalidTargetId = dedupedTargets.find((targetId) => !isUuid(targetId));
  if (invalidTargetId) {
    throw new ApplicationError(
      `Custom attribute "${fieldKey}" must contain valid client IDs`,
      { code: "BAD_REQUEST", details: { field: fieldKey } },
    );
  }

  if (definition.relationValueMode === "single" && dedupedTargets.length > 1) {
    throw new ApplicationError(
      `Custom attribute "${fieldKey}" supports only one related client`,
      { code: "BAD_REQUEST", details: { field: fieldKey } },
    );
  }

  if (dedupedTargets.includes(sourceClientId)) {
    throw new ApplicationError(
      `Custom attribute "${fieldKey}" cannot reference the same client`,
      { code: "BAD_REQUEST", details: { field: fieldKey } },
    );
  }

  return dedupedTargets;
}

function relationTargetsMatch(current: string[], next: string[]): boolean {
  if (current.length !== next.length) return false;

  const currentSet = new Set(current);
  for (const targetId of next) {
    if (!currentSet.has(targetId)) return false;
  }

  return true;
}

type RelationTargetsCache = Map<string, string[]>;

function throwRequiredCustomAttributeError(fieldKey: string): never {
  throw new ApplicationError(`Custom attribute "${fieldKey}" is required`, {
    code: "BAD_REQUEST",
    details: { field: fieldKey },
  });
}

// ─── Service ───

export class ClientCustomAttributeService {
  async listDefinitions(
    context: ServiceContext,
  ): Promise<CustomAttributeDefinitionResponse[]> {
    return withOrg(context.orgId, async (tx) => {
      const definitions = await customAttributeRepository.listDefinitions(
        tx,
        context.orgId,
      );
      return definitions.map((definition) => toDefinitionResponse(definition));
    });
  }

  async createDefinition(
    input: CreateCustomAttributeDefinitionInput,
    context: ServiceContext,
  ): Promise<CustomAttributeDefinitionResponse> {
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

          if (input.type === "RELATION_CLIENT") {
            const relationConfig = input.relationConfig;
            if (!relationConfig) {
              throw new ApplicationError(
                "relationConfig is required for RELATION_CLIENT type",
                { code: "BAD_REQUEST", details: { field: "relationConfig" } },
              );
            }

            if (input.reverseRelation) {
              const reverseExisting =
                await customAttributeRepository.findDefinitionByFieldKey(
                  tx,
                  context.orgId,
                  input.reverseRelation.fieldKey,
                );
              if (reverseExisting) {
                throw new ApplicationError(
                  `Custom attribute "${input.reverseRelation.fieldKey}" already exists`,
                  {
                    code: "DUPLICATE_ENTRY",
                    details: { field: "reverseRelation.fieldKey" },
                  },
                );
              }
            }

            const forward = await customAttributeRepository.createDefinition(
              tx,
              context.orgId,
              {
                fieldKey: input.fieldKey,
                label: input.label,
                type: input.type,
                slotColumn: null,
                required: input.required ?? false,
                options: null,
                relationTargetEntity: relationConfig.targetEntity,
                relationValueMode: relationConfig.valueMode,
                pairedDefinitionId: null,
                pairedRole: null,
                displayOrder: input.displayOrder ?? 0,
              },
            );

            if (!input.reverseRelation) {
              return toDefinitionResponse(forward);
            }

            const reverse = await customAttributeRepository.createDefinition(
              tx,
              context.orgId,
              {
                fieldKey: input.reverseRelation.fieldKey,
                label: input.reverseRelation.label,
                type: "RELATION_CLIENT",
                slotColumn: null,
                required: input.reverseRelation.required ?? false,
                options: null,
                relationTargetEntity: relationConfig.targetEntity,
                relationValueMode: input.reverseRelation.valueMode,
                pairedDefinitionId: forward.id,
                pairedRole: "reverse",
                displayOrder: (input.displayOrder ?? 0) + 1,
              },
            );

            const forwardWithPairing =
              await customAttributeRepository.updateDefinitionPairing(
                tx,
                context.orgId,
                forward.id,
                {
                  pairedDefinitionId: reverse.id,
                  pairedRole: "forward",
                },
              );

            if (!forwardWithPairing) {
              throw new ApplicationError(
                "Custom attribute definition not found after creation",
                { code: "INTERNAL_ERROR" },
              );
            }

            return toDefinitionResponse(forwardWithPairing);
          }

          const definitions = await customAttributeRepository.listDefinitions(
            tx,
            context.orgId,
          );
          const slotColumn = findFreeSlot(definitions, input.type);

          const definition = await customAttributeRepository.createDefinition(
            tx,
            context.orgId,
            {
              fieldKey: input.fieldKey,
              label: input.label,
              type: input.type,
              slotColumn,
              required: input.required ?? false,
              options: input.options ?? null,
              relationTargetEntity: null,
              relationValueMode: null,
              pairedDefinitionId: null,
              pairedRole: null,
              displayOrder: input.displayOrder ?? 0,
            },
          );

          return toDefinitionResponse(definition);
        }),
      { retries: 3, shouldRetry: isUniqueConstraintViolation },
    );
  }

  async updateDefinition(
    id: string,
    input: UpdateCustomAttributeDefinitionInput,
    context: ServiceContext,
  ): Promise<CustomAttributeDefinitionResponse> {
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

      if (isRelationDefinition(existing) && input.options !== undefined) {
        throw new ApplicationError(
          "Relation custom attributes do not support options",
          { code: "BAD_REQUEST", details: { field: "options" } },
        );
      }

      const updateData: {
        label?: string;
        required?: boolean;
        options?: string[];
        displayOrder?: number;
      } = {};

      if (input.label !== undefined) updateData.label = input.label;
      if (input.required !== undefined) updateData.required = input.required;
      if (input.options !== undefined) updateData.options = input.options;
      if (input.displayOrder !== undefined) {
        updateData.displayOrder = input.displayOrder;
      }

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

      return toDefinitionResponse(result);
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

      const definitionIdsToDelete = uniq(
        compact([
          existing.id,
          isRelationDefinition(existing) ? existing.pairedDefinitionId : null,
        ]),
      );

      const definitionsToDelete =
        await customAttributeRepository.findDefinitionsByIds(
          tx,
          context.orgId,
          definitionIdsToDelete,
        );

      await forEachAsync(
        definitionsToDelete,
        async (definition) => {
          if (isSlotBackedDefinition(definition)) {
            await customAttributeRepository.clearSlotColumn(
              tx,
              context.orgId,
              definition.slotColumn,
            );
            return;
          }

          await customAttributeRepository.clearRelationValuesForDefinition(
            tx,
            context.orgId,
            definition.id,
          );
        },
        { concurrency: 1 },
      );

      await forEachAsync(
        definitionIdsToDelete,
        async (definitionId) => {
          await customAttributeRepository.clearDefinitionPairing(
            tx,
            context.orgId,
            definitionId,
          );
        },
        { concurrency: 1 },
      );

      await customAttributeRepository.deleteDefinitions(
        tx,
        context.orgId,
        definitionIdsToDelete,
      );
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

      for (const definition of definitions) {
        if (!isSlotBackedDefinition(definition)) continue;
        const prefix = definition.slotColumn.charAt(0);
        if (isSlotPrefix(prefix)) {
          countByPrefix[prefix] += 1;
        }
      }

      return {
        t: { used: countByPrefix.t, total: SLOT_COUNT_BY_PREFIX.t },
        n: { used: countByPrefix.n, total: SLOT_COUNT_BY_PREFIX.n },
        d: { used: countByPrefix.d, total: SLOT_COUNT_BY_PREFIX.d },
        b: { used: countByPrefix.b, total: SLOT_COUNT_BY_PREFIX.b },
        j: { used: countByPrefix.j, total: SLOT_COUNT_BY_PREFIX.j },
      };
    });
  }

  async reorderDefinitions(
    orderedIds: string[],
    context: ServiceContext,
  ): Promise<{ success: true }> {
    await withOrg(context.orgId, async (tx) => {
      const existing = await customAttributeRepository.listDefinitions(
        tx,
        context.orgId,
      );
      const existingIds = new Set(existing.map((definition) => definition.id));
      const inputIds = new Set(orderedIds);

      if (
        existingIds.size !== inputIds.size ||
        existing.some((definition) => !inputIds.has(definition.id))
      ) {
        throw new ApplicationError(
          "orderedIds must contain exactly all custom attribute definition IDs",
          { code: "VALIDATION_ERROR" },
        );
      }

      const ids = orderedIds;
      const orders = orderedIds.map((_, index) => index);
      await tx.execute(sql`
        UPDATE ${clientCustomAttributeDefinitions}
        SET display_order = data.new_order, updated_at = now()
        FROM unnest(${ids}::uuid[], ${orders}::int[]) AS data(id, new_order)
        WHERE ${clientCustomAttributeDefinitions.id} = data.id
          AND ${clientCustomAttributeDefinitions.orgId} = ${context.orgId}
      `);
    });

    return { success: true };
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

    const definitionsByFieldKey = new Map(
      definitions.map((definition) => [definition.fieldKey, definition]),
    );

    const slotUpdates: Partial<Record<SlotColumn, unknown>> = {};
    const relationUpdates = new Map<string, string[]>();

    for (const [fieldKey, rawValue] of Object.entries(values)) {
      const definition = definitionsByFieldKey.get(fieldKey);
      if (!definition) {
        throw new ApplicationError(`Unknown custom attribute: ${fieldKey}`, {
          code: "BAD_REQUEST",
          details: { field: fieldKey },
        });
      }

      if (isRelationDefinition(definition)) {
        const targets = parseRelationTargets({
          definition,
          fieldKey,
          value: rawValue,
          sourceClientId: clientId,
        });
        relationUpdates.set(definition.id, targets);
        continue;
      }

      if (rawValue === null) {
        slotUpdates[definition.slotColumn] = null;
        continue;
      }

      switch (definition.type) {
        case "TEXT":
        case "SELECT":
          if (typeof rawValue !== "string") {
            throw new ApplicationError(
              `Custom attribute "${fieldKey}" must be a string`,
              { code: "BAD_REQUEST", details: { field: fieldKey } },
            );
          }

          if (
            definition.type === "SELECT" &&
            definition.options &&
            !definition.options.includes(rawValue)
          ) {
            throw new ApplicationError(
              `Invalid option "${rawValue}" for "${fieldKey}". Valid options: ${definition.options.join(", ")}`,
              { code: "BAD_REQUEST", details: { field: fieldKey } },
            );
          }

          slotUpdates[definition.slotColumn] = rawValue;
          break;
        case "NUMBER":
          if (typeof rawValue !== "number") {
            throw new ApplicationError(
              `Custom attribute "${fieldKey}" must be a number`,
              { code: "BAD_REQUEST", details: { field: fieldKey } },
            );
          }
          slotUpdates[definition.slotColumn] = String(rawValue);
          break;
        case "DATE": {
          let parsed: Date;
          if (rawValue instanceof Date) {
            parsed = rawValue;
          } else if (typeof rawValue === "string") {
            parsed = new Date(rawValue);
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

          slotUpdates[definition.slotColumn] = parsed;
          break;
        }
        case "BOOLEAN":
          if (typeof rawValue !== "boolean") {
            throw new ApplicationError(
              `Custom attribute "${fieldKey}" must be a boolean`,
              { code: "BAD_REQUEST", details: { field: fieldKey } },
            );
          }
          slotUpdates[definition.slotColumn] = rawValue;
          break;
        case "MULTI_SELECT":
          if (!Array.isArray(rawValue)) {
            throw new ApplicationError(
              `Custom attribute "${fieldKey}" must be an array of strings`,
              { code: "BAD_REQUEST", details: { field: fieldKey } },
            );
          }

          if (definition.options) {
            const invalid = rawValue.filter(
              (value) =>
                typeof value !== "string" ||
                !definition.options!.includes(value),
            );

            if (invalid.length > 0) {
              throw new ApplicationError(
                `Invalid options for "${fieldKey}": ${invalid.join(", ")}`,
                { code: "BAD_REQUEST", details: { field: fieldKey } },
              );
            }
          }

          slotUpdates[definition.slotColumn] = rawValue;
          break;
      }
    }

    for (const definition of definitions) {
      if (!definition.required) continue;
      const hasInputValue = definition.fieldKey in values;

      if (options?.enforceRequired && !hasInputValue) {
        throwRequiredCustomAttributeError(definition.fieldKey);
      }

      if (!hasInputValue) {
        continue;
      }

      if (isRelationDefinition(definition)) {
        const relationTargets = relationUpdates.get(definition.id) ?? [];
        if (relationTargets.length === 0) {
          throwRequiredCustomAttributeError(definition.fieldKey);
        }
        continue;
      }

      const value = values[definition.fieldKey];
      if (value === null || value === undefined) {
        throwRequiredCustomAttributeError(definition.fieldKey);
      }
    }

    const relationTargetIds = uniq(
      Array.from(relationUpdates.values()).flatMap((targetIds) => targetIds),
    );

    if (relationTargetIds.length > 0) {
      const existingTargetIds = new Set(
        await customAttributeRepository.findExistingClientIds(
          tx,
          orgId,
          relationTargetIds,
        ),
      );
      const missingTargetId = relationTargetIds.find(
        (targetId) => !existingTargetIds.has(targetId),
      );

      if (missingTargetId) {
        throw new ApplicationError(
          `Related client "${missingTargetId}" does not exist in this organization`,
          { code: "BAD_REQUEST" },
        );
      }
    }

    if (Object.keys(slotUpdates).length > 0) {
      await customAttributeRepository.upsertValues(
        tx,
        orgId,
        clientId,
        slotUpdates,
      );
    }

    const definitionsById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
    const relationTargetsCache: RelationTargetsCache = new Map();
    const relationDefinitionIds = Array.from(relationUpdates.keys());
    const currentRelationRows =
      relationDefinitionIds.length > 0
        ? await customAttributeRepository.listRelationValuesBySource(
            tx,
            orgId,
            clientId,
            relationDefinitionIds,
          )
        : [];
    const currentTargetsByDefinitionId = new Map<string, string[]>();

    for (const row of currentRelationRows) {
      const targets = currentTargetsByDefinitionId.get(row.definitionId) ?? [];
      targets.push(row.targetClientId);
      currentTargetsByDefinitionId.set(row.definitionId, targets);
    }

    await forEachAsync(
      Array.from(relationUpdates.entries()),
      async ([definitionId, nextTargets]) => {
        const definition = definitionsById.get(definitionId);
        if (!definition || !isRelationDefinition(definition)) {
          return;
        }

        const currentTargets =
          currentTargetsByDefinitionId.get(definition.id) ?? [];
        relationTargetsCache.set(
          this.relationTargetsCacheKey(definition.id, clientId),
          [...currentTargets],
        );

        if (!relationTargetsMatch(currentTargets, nextTargets)) {
          await this.replaceRelationTargetsForSource({
            tx,
            orgId,
            definitionId: definition.id,
            clientId,
            targetClientIds: nextTargets,
            cache: relationTargetsCache,
          });
        }

        await this.syncPairedDefinition({
          tx,
          orgId,
          sourceClientId: clientId,
          definition,
          currentTargets,
          nextTargets,
          definitionsById,
          relationTargetsCache,
        });
      },
      { concurrency: 1 },
    );

    return definitions;
  }

  async loadClientCustomAttributes(
    tx: DbClient,
    orgId: string,
    clientId: string,
  ): Promise<CustomAttributeValueMap> {
    const definitions = await customAttributeRepository.listDefinitions(
      tx,
      orgId,
    );
    return this.loadClientCustomAttributesFromDefs(
      tx,
      orgId,
      clientId,
      definitions,
    );
  }

  async loadClientCustomAttributesFromDefs(
    tx: DbClient,
    orgId: string,
    clientId: string,
    definitions: ValidatedDefinition[],
  ): Promise<CustomAttributeValueMap> {
    if (definitions.length === 0) return {};

    const slotDefinitions = definitions.filter(isSlotBackedDefinition);
    const relationDefinitions = definitions.filter(isRelationDefinition);

    const [valuesRow, relationRows] = await Promise.all([
      slotDefinitions.length > 0
        ? customAttributeRepository.getValues(tx, orgId, clientId)
        : Promise.resolve(null),
      relationDefinitions.length > 0
        ? customAttributeRepository.listRelationValuesBySource(
            tx,
            orgId,
            clientId,
            relationDefinitions.map((definition) => definition.id),
          )
        : Promise.resolve([]),
    ]);

    return this.buildAttributeMap(definitions, valuesRow, relationRows);
  }

  private buildAttributeMap(
    definitions: ValidatedDefinition[],
    valuesRow: CustomAttributeValues | null,
    relationRows: Array<{ definitionId: string; targetClientId: string }>,
  ): CustomAttributeValueMap {
    const result: CustomAttributeValueMap = {};

    for (const definition of definitions) {
      result[definition.fieldKey] = null;
    }

    const slotDefinitions = definitions.filter(isSlotBackedDefinition);
    if (valuesRow && slotDefinitions.length > 0) {
      const slotValues = mapFromSlots(slotDefinitions, valuesRow);
      for (const [fieldKey, value] of Object.entries(slotValues)) {
        result[fieldKey] = value;
      }
    }

    const relationDefinitions = definitions.filter(isRelationDefinition);
    if (relationDefinitions.length > 0) {
      const definitionById = new Map(
        relationDefinitions.map((definition) => [definition.id, definition]),
      );
      const targetsByDefinitionId = new Map<string, string[]>();

      for (const row of relationRows) {
        const targets = targetsByDefinitionId.get(row.definitionId) ?? [];
        targets.push(row.targetClientId);
        targetsByDefinitionId.set(row.definitionId, targets);
      }

      for (const [definitionId, targetIds] of targetsByDefinitionId.entries()) {
        const definition = definitionById.get(definitionId);
        if (!definition) continue;

        result[definition.fieldKey] =
          definition.relationValueMode === "single"
            ? (targetIds[0] ?? null)
            : targetIds;
      }
    }

    return result;
  }

  private async syncPairedDefinition(input: {
    tx: DbClient;
    orgId: string;
    sourceClientId: string;
    definition: RelationDefinition;
    currentTargets: string[];
    nextTargets: string[];
    definitionsById: Map<string, ValidatedDefinition>;
    relationTargetsCache: RelationTargetsCache;
  }): Promise<void> {
    const {
      tx,
      orgId,
      sourceClientId,
      definition,
      currentTargets,
      nextTargets,
      definitionsById,
      relationTargetsCache,
    } = input;

    if (!definition.pairedDefinitionId) return;

    const paired = definitionsById.get(definition.pairedDefinitionId);
    if (!paired) {
      logger.warn(
        "Skipping paired relation sync: paired definition missing for {definitionId} (pairedDefinitionId={pairedDefinitionId})",
        {
          orgId,
          definitionId: definition.id,
          pairedDefinitionId: definition.pairedDefinitionId,
        },
      );
      return;
    }

    if (!isRelationDefinition(paired)) {
      logger.warn(
        "Skipping paired relation sync: paired definition {pairedDefinitionId} is not RELATION_CLIENT",
        {
          orgId,
          definitionId: definition.id,
          pairedDefinitionId: definition.pairedDefinitionId,
          pairedType: paired.type,
        },
      );
      return;
    }

    const currentSet = new Set(currentTargets);
    const nextSet = new Set(nextTargets);

    const removedTargets = currentTargets.filter((id) => !nextSet.has(id));
    const addedTargets = nextTargets.filter((id) => !currentSet.has(id));

    await forEachAsync(
      removedTargets,
      async (targetClientId) => {
        await this.removePairedEdge(
          tx,
          orgId,
          paired,
          targetClientId,
          sourceClientId,
          relationTargetsCache,
        );
      },
      { concurrency: 1 },
    );

    await forEachAsync(
      addedTargets,
      async (targetClientId) => {
        const displacedTargets = await this.addPairedEdge(
          tx,
          orgId,
          paired,
          targetClientId,
          sourceClientId,
          relationTargetsCache,
        );

        await forEachAsync(
          displacedTargets,
          async (displacedTarget) => {
            await this.removePairedEdge(
              tx,
              orgId,
              definition,
              displacedTarget,
              targetClientId,
              relationTargetsCache,
            );
          },
          { concurrency: 1 },
        );
      },
      { concurrency: 1 },
    );
  }

  private async addPairedEdge(
    tx: DbClient,
    orgId: string,
    definition: RelationDefinition,
    sourceClientId: string,
    targetClientId: string,
    cache: RelationTargetsCache,
  ): Promise<string[]> {
    const currentTargets = await this.loadRelationTargetsForSource({
      tx,
      orgId,
      definitionId: definition.id,
      clientId: sourceClientId,
      cache,
    });

    if (currentTargets.includes(targetClientId)) {
      return [];
    }

    if (definition.relationValueMode === "single") {
      await this.replaceRelationTargetsForSource({
        tx,
        orgId,
        definitionId: definition.id,
        clientId: sourceClientId,
        targetClientIds: [targetClientId],
        cache,
      });

      return currentTargets;
    }

    await this.replaceRelationTargetsForSource({
      tx,
      orgId,
      definitionId: definition.id,
      clientId: sourceClientId,
      targetClientIds: [...currentTargets, targetClientId],
      cache,
    });

    return [];
  }

  private async removePairedEdge(
    tx: DbClient,
    orgId: string,
    definition: RelationDefinition,
    sourceClientId: string,
    targetClientId: string,
    cache: RelationTargetsCache,
  ): Promise<void> {
    const currentTargets = await this.loadRelationTargetsForSource({
      tx,
      orgId,
      definitionId: definition.id,
      clientId: sourceClientId,
      cache,
    });

    if (!currentTargets.includes(targetClientId)) {
      return;
    }

    const nextTargets = currentTargets.filter((id) => id !== targetClientId);

    await this.replaceRelationTargetsForSource({
      tx,
      orgId,
      definitionId: definition.id,
      clientId: sourceClientId,
      targetClientIds: nextTargets,
      cache,
    });
  }

  private relationTargetsCacheKey(
    definitionId: string,
    clientId: string,
  ): string {
    return `${definitionId}:${clientId}`;
  }

  private async loadRelationTargetsForSource(input: {
    tx: DbClient;
    orgId: string;
    definitionId: string;
    clientId: string;
    cache: RelationTargetsCache;
  }): Promise<string[]> {
    const { tx, orgId, definitionId, clientId, cache } = input;
    const cacheKey = this.relationTargetsCacheKey(definitionId, clientId);
    const cachedTargets = cache.get(cacheKey);

    if (cachedTargets) {
      return [...cachedTargets];
    }

    const rows = await customAttributeRepository.listRelationValuesBySource(
      tx,
      orgId,
      clientId,
      [definitionId],
    );
    const loadedTargets = rows.map((row) => row.targetClientId);
    cache.set(cacheKey, loadedTargets);
    return [...loadedTargets];
  }

  private async replaceRelationTargetsForSource(input: {
    tx: DbClient;
    orgId: string;
    definitionId: string;
    clientId: string;
    targetClientIds: string[];
    cache: RelationTargetsCache;
  }): Promise<void> {
    const { tx, orgId, definitionId, clientId, targetClientIds, cache } = input;
    try {
      await customAttributeRepository.replaceRelationValuesForSource(
        tx,
        orgId,
        definitionId,
        clientId,
        targetClientIds,
      );
    } catch (error) {
      if (isRelationWriteContentionError(error)) {
        logger.warn(
          "Relation custom attribute write contention for org {orgId}, client {clientId}, definition {definitionId}",
          {
            orgId,
            clientId,
            definitionId,
            targetCount: targetClientIds.length,
          },
        );

        throw new ApplicationError(
          "Custom attribute update conflicted with another in-flight update. Please retry.",
          {
            code: "CONFLICT",
            details: { field: "customAttributes" },
            cause: error,
          },
        );
      }

      throw error;
    }

    cache.set(this.relationTargetsCacheKey(definitionId, clientId), [
      ...targetClientIds,
    ]);
  }
}

export const clientCustomAttributeService = new ClientCustomAttributeService();
