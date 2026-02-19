import { eq, sql } from "drizzle-orm";
import {
  clientCustomAttributeDefinitions,
  clientCustomAttributeValues,
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

export type ValidatedDefinition = Omit<
  CustomAttributeDefinition,
  "slotColumn"
> & {
  slotColumn: SlotColumn;
};

function validateDefinitions(
  defs: CustomAttributeDefinition[],
): ValidatedDefinition[] {
  return defs.map((def) => {
    if (!isSlotColumn(def.slotColumn)) {
      throw new ApplicationError(
        `Corrupt slot column "${def.slotColumn}" in definition "${def.fieldKey}"`,
        { code: "INTERNAL_ERROR" },
      );
    }
    return { ...def, slotColumn: def.slotColumn };
  });
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
    return validateDefinitions([result])[0]!;
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
    return validateDefinitions([result])[0]!;
  }

  async createDefinition(
    tx: DbClient,
    orgId: string,
    input: Omit<CustomAttributeDefinitionInsert, "id" | "orgId">,
  ): Promise<CustomAttributeDefinition> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(clientCustomAttributeDefinitions)
      .values({ ...input, orgId })
      .returning();
    return result!;
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
  ): Promise<CustomAttributeDefinition | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(clientCustomAttributeDefinitions)
      .set({ ...input, updatedAt: sql`now()` })
      .where(eq(clientCustomAttributeDefinitions.id, id))
      .returning();
    return result ?? null;
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

  // ─── Values ───

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
    // slot columns are validated at the service layer via isSlotColumn guards
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
    return result!;
  }
}

export const customAttributeRepository = new CustomAttributeRepository();
