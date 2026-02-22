import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  clientCustomAttributeDefinitions,
  clientCustomAttributeRelations,
  clientCustomAttributeValues,
  clients,
} from "@scheduling/db/schema";
import type { DbClient } from "../lib/db.js";
import { isSlotColumn, type SlotColumn } from "../lib/slot-config.js";
import { ApplicationError } from "../errors/application-error.js";
import { setOrgContext } from "./base.js";

export type CustomAttributeDefinition =
  typeof clientCustomAttributeDefinitions.$inferSelect;
export type CustomAttributeDefinitionInsert =
  typeof clientCustomAttributeDefinitions.$inferInsert;
export type CustomAttributeValues =
  typeof clientCustomAttributeValues.$inferSelect;
export type CustomAttributeRelationValue =
  typeof clientCustomAttributeRelations.$inferSelect;
type DefinitionType = CustomAttributeDefinition["type"];
type SlotBackedType = Exclude<DefinitionType, "RELATION_CLIENT">;
const RELATION_WRITE_LOCK_TIMEOUT = "5s";

type DefinitionBase = Omit<
  CustomAttributeDefinition,
  "slotColumn" | "relationTargetEntity" | "relationValueMode" | "pairedRole"
>;

export type SlotBackedDefinition = DefinitionBase & {
  type: SlotBackedType;
  slotColumn: SlotColumn;
  relationTargetEntity: null;
  relationValueMode: null;
  pairedRole: null;
};

export type RelationDefinition = DefinitionBase & {
  type: "RELATION_CLIENT";
  slotColumn: null;
  relationTargetEntity: "CLIENT";
  relationValueMode: "single" | "multi";
  pairedRole: "forward" | "reverse" | null;
};

export type ValidatedDefinition = SlotBackedDefinition | RelationDefinition;

function toSlotBackedType(type: DefinitionType): SlotBackedType {
  if (type === "RELATION_CLIENT") {
    throw new ApplicationError(
      "Expected a non-relation custom attribute type",
      { code: "INTERNAL_ERROR" },
    );
  }

  return type;
}

function validateDefinition(
  def: CustomAttributeDefinition,
): ValidatedDefinition {
  if (def.type === "RELATION_CLIENT") {
    if (def.slotColumn !== null) {
      throw new ApplicationError(
        `Relation definition "${def.fieldKey}" must not have a slot column`,
        { code: "INTERNAL_ERROR" },
      );
    }

    if (def.relationTargetEntity !== "CLIENT") {
      throw new ApplicationError(
        `Relation definition "${def.fieldKey}" is missing a valid relation target entity`,
        { code: "INTERNAL_ERROR" },
      );
    }

    if (
      def.relationValueMode !== "single" &&
      def.relationValueMode !== "multi"
    ) {
      throw new ApplicationError(
        `Relation definition "${def.fieldKey}" is missing a valid relation value mode`,
        { code: "INTERNAL_ERROR" },
      );
    }

    if (
      def.pairedRole !== null &&
      def.pairedRole !== "forward" &&
      def.pairedRole !== "reverse"
    ) {
      throw new ApplicationError(
        `Relation definition "${def.fieldKey}" has an invalid pairing role`,
        { code: "INTERNAL_ERROR" },
      );
    }

    return {
      ...def,
      type: "RELATION_CLIENT",
      slotColumn: null,
      relationTargetEntity: "CLIENT",
      relationValueMode: def.relationValueMode,
      pairedRole: def.pairedRole,
    };
  }

  if (typeof def.slotColumn !== "string" || !isSlotColumn(def.slotColumn)) {
    throw new ApplicationError(
      `Corrupt slot column "${def.slotColumn}" in definition "${def.fieldKey}"`,
      { code: "INTERNAL_ERROR" },
    );
  }

  const slotColumn = def.slotColumn;

  if (
    def.relationTargetEntity !== null ||
    def.relationValueMode !== null ||
    def.pairedRole !== null
  ) {
    throw new ApplicationError(
      `Non-relation definition "${def.fieldKey}" contains relation metadata`,
      { code: "INTERNAL_ERROR" },
    );
  }

  return {
    ...def,
    type: toSlotBackedType(def.type),
    slotColumn,
    relationTargetEntity: null,
    relationValueMode: null,
    pairedRole: null,
  };
}

function validateDefinitions(
  defs: CustomAttributeDefinition[],
): ValidatedDefinition[] {
  return defs.map((def) => validateDefinition(def));
}

export class CustomAttributeRepository {
  // ─── Definitions ───

  async listDefinitions(
    tx: DbClient,
    orgId: string,
  ): Promise<ValidatedDefinition[]> {
    await setOrgContext(tx, orgId);
    const rows = await tx
      .select()
      .from(clientCustomAttributeDefinitions)
      .orderBy(
        clientCustomAttributeDefinitions.displayOrder,
        clientCustomAttributeDefinitions.fieldKey,
      );
    return validateDefinitions(rows);
  }

  async findDefinitionById(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<ValidatedDefinition | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(clientCustomAttributeDefinitions)
      .where(eq(clientCustomAttributeDefinitions.id, id))
      .limit(1);
    if (!result) return null;
    return validateDefinitions([result])[0] ?? null;
  }

  async findDefinitionsByIds(
    tx: DbClient,
    orgId: string,
    ids: string[],
  ): Promise<ValidatedDefinition[]> {
    if (ids.length === 0) return [];
    await setOrgContext(tx, orgId);
    const rows = await tx
      .select()
      .from(clientCustomAttributeDefinitions)
      .where(inArray(clientCustomAttributeDefinitions.id, ids));
    return validateDefinitions(rows);
  }

  async findDefinitionByFieldKey(
    tx: DbClient,
    orgId: string,
    fieldKey: string,
  ): Promise<ValidatedDefinition | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(clientCustomAttributeDefinitions)
      .where(eq(clientCustomAttributeDefinitions.fieldKey, fieldKey))
      .limit(1);
    if (!result) return null;
    return validateDefinitions([result])[0] ?? null;
  }

  async createDefinition(
    tx: DbClient,
    orgId: string,
    input: Omit<CustomAttributeDefinitionInsert, "id" | "orgId">,
  ): Promise<ValidatedDefinition> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(clientCustomAttributeDefinitions)
      .values({ ...input, orgId })
      .returning();

    if (!result) {
      throw new ApplicationError(
        "Failed to create custom attribute definition",
        {
          code: "INTERNAL_ERROR",
        },
      );
    }

    return validateDefinition(result);
  }

  async updateDefinition(
    tx: DbClient,
    orgId: string,
    id: string,
    input: Partial<
      Pick<
        CustomAttributeDefinitionInsert,
        "label" | "required" | "options" | "displayOrder"
      >
    >,
  ): Promise<ValidatedDefinition | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(clientCustomAttributeDefinitions)
      .set({ ...input, updatedAt: sql`now()` })
      .where(eq(clientCustomAttributeDefinitions.id, id))
      .returning();

    return result ? validateDefinition(result) : null;
  }

  async updateDefinitionPairing(
    tx: DbClient,
    orgId: string,
    id: string,
    input: {
      pairedDefinitionId: string | null;
      pairedRole: "forward" | "reverse" | null;
    },
  ): Promise<ValidatedDefinition | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(clientCustomAttributeDefinitions)
      .set({
        pairedDefinitionId: input.pairedDefinitionId,
        pairedRole: input.pairedRole,
        updatedAt: sql`now()`,
      })
      .where(eq(clientCustomAttributeDefinitions.id, id))
      .returning();

    return result ? validateDefinition(result) : null;
  }

  async clearDefinitionPairing(
    tx: DbClient,
    orgId: string,
    pairedDefinitionId: string,
  ): Promise<void> {
    await setOrgContext(tx, orgId);
    await tx
      .update(clientCustomAttributeDefinitions)
      .set({
        pairedDefinitionId: null,
        pairedRole: null,
        updatedAt: sql`now()`,
      })
      .where(
        eq(
          clientCustomAttributeDefinitions.pairedDefinitionId,
          pairedDefinitionId,
        ),
      );
  }

  async deleteDefinition(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const result = await tx
      .delete(clientCustomAttributeDefinitions)
      .where(eq(clientCustomAttributeDefinitions.id, id))
      .returning({ id: clientCustomAttributeDefinitions.id });
    return result.length > 0;
  }

  async clearSlotColumn(
    tx: DbClient,
    orgId: string,
    slotColumn: SlotColumn,
  ): Promise<void> {
    await setOrgContext(tx, orgId);
    // Safe: slotColumn is typed as SlotColumn — only whitelisted values are possible
    await tx.execute(
      sql`UPDATE client_custom_attribute_values SET ${sql.raw(`"${slotColumn}"`)} = NULL, updated_at = now()`,
    );
  }

  // ─── Slot-backed values ───

  async getValues(
    tx: DbClient,
    orgId: string,
    clientId: string,
  ): Promise<CustomAttributeValues | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(clientCustomAttributeValues)
      .where(eq(clientCustomAttributeValues.clientId, clientId))
      .limit(1);
    return result ?? null;
  }

  async upsertValues(
    tx: DbClient,
    orgId: string,
    clientId: string,
    slotUpdates: Partial<Record<SlotColumn, unknown>>,
  ): Promise<CustomAttributeValues> {
    await setOrgContext(tx, orgId);
    // Widen to Record<string, unknown> for Drizzle compatibility —
    // slot columns are validated at the service layer via isSlotColumn guards.
    const updates: Record<string, unknown> = { ...slotUpdates };
    const [result] = await tx
      .insert(clientCustomAttributeValues)
      .values({
        orgId,
        clientId,
        ...updates,
      } as typeof clientCustomAttributeValues.$inferInsert)
      .onConflictDoUpdate({
        target: [
          clientCustomAttributeValues.orgId,
          clientCustomAttributeValues.clientId,
        ],
        set: {
          ...updates,
          updatedAt: sql`now()`,
        } as Record<string, unknown>,
      })
      .returning();

    if (!result) {
      throw new ApplicationError("Failed to upsert custom attribute values", {
        code: "INTERNAL_ERROR",
      });
    }

    return result;
  }

  // ─── Relation-backed values ───

  async listRelationValuesBySource(
    tx: DbClient,
    orgId: string,
    sourceClientId: string,
    definitionIds?: string[],
  ): Promise<Array<{ definitionId: string; targetClientId: string }>> {
    await setOrgContext(tx, orgId);

    const filters = [
      eq(clientCustomAttributeRelations.sourceClientId, sourceClientId),
    ];

    if (definitionIds && definitionIds.length > 0) {
      filters.push(
        inArray(clientCustomAttributeRelations.definitionId, definitionIds),
      );
    }

    const rows = await tx
      .select({
        definitionId: clientCustomAttributeRelations.definitionId,
        targetClientId: clientCustomAttributeRelations.targetClientId,
      })
      .from(clientCustomAttributeRelations)
      .where(and(...filters))
      .orderBy(
        asc(clientCustomAttributeRelations.createdAt),
        asc(clientCustomAttributeRelations.id),
      );

    return rows;
  }

  async replaceRelationValuesForSource(
    tx: DbClient,
    orgId: string,
    definitionId: string,
    sourceClientId: string,
    targetClientIds: string[],
  ): Promise<void> {
    await setOrgContext(tx, orgId);

    // Avoid hanging requests on lock contention during paired relation updates.
    await tx.execute(
      sql.raw(`SET LOCAL lock_timeout = '${RELATION_WRITE_LOCK_TIMEOUT}'`),
    );

    // Serialize all relation writes for this source client within a transaction.
    // Paired-definition sync can mutate relation rows for a different client than
    // the API request target, so relying only on the primary client update lock
    // is insufficient.
    await tx.execute(
      sql`SELECT 1 FROM ${clients} WHERE ${clients.id} = ${sourceClientId} FOR UPDATE`,
    );

    await tx
      .delete(clientCustomAttributeRelations)
      .where(
        and(
          eq(clientCustomAttributeRelations.definitionId, definitionId),
          eq(clientCustomAttributeRelations.sourceClientId, sourceClientId),
        ),
      );

    if (targetClientIds.length === 0) {
      return;
    }

    await tx.insert(clientCustomAttributeRelations).values(
      targetClientIds.map((targetClientId) => ({
        orgId,
        definitionId,
        sourceClientId,
        targetClientId,
      })),
    );
  }

  async clearRelationValuesForDefinition(
    tx: DbClient,
    orgId: string,
    definitionId: string,
  ): Promise<void> {
    await setOrgContext(tx, orgId);

    await tx
      .delete(clientCustomAttributeRelations)
      .where(eq(clientCustomAttributeRelations.definitionId, definitionId));
  }

  async findExistingClientIds(
    tx: DbClient,
    orgId: string,
    clientIds: string[],
  ): Promise<string[]> {
    if (clientIds.length === 0) return [];

    await setOrgContext(tx, orgId);
    const rows = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(inArray(clients.id, clientIds));

    return rows.map((row) => row.id);
  }
}

export const customAttributeRepository = new CustomAttributeRepository();
