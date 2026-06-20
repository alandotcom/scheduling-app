import { eq, inArray } from "drizzle-orm";
import { integrations } from "@scheduling/db/schema";
import type { AppIntegrationKey } from "@scheduling/dto";
import type { OrgScopedTx } from "../lib/db.js";

export type IntegrationRow = typeof integrations.$inferSelect;

export interface IntegrationDefaultsInput {
  key: AppIntegrationKey;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface IntegrationUpdateInput {
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export class IntegrationRepository {
  async ensureDefaults(
    tx: OrgScopedTx,
    defaults: readonly IntegrationDefaultsInput[],
  ): Promise<void> {
    if (defaults.length === 0) {
      return;
    }

    await tx
      .insert(integrations)
      .values(
        defaults.map((item) => ({
          key: item.key,
          enabled: item.enabled,
          config: item.config,
        })),
      )
      .onConflictDoNothing({
        target: [integrations.orgId, integrations.key],
      });
  }

  async listByOrg(tx: OrgScopedTx): Promise<IntegrationRow[]> {
    return tx.select().from(integrations);
  }

  async listByKeys(
    tx: OrgScopedTx,
    keys: readonly AppIntegrationKey[],
  ): Promise<IntegrationRow[]> {
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) {
      return [];
    }

    return tx
      .select()
      .from(integrations)
      .where(inArray(integrations.key, uniqueKeys));
  }

  async findByKey(
    tx: OrgScopedTx,
    key: AppIntegrationKey,
  ): Promise<IntegrationRow | null> {
    const [row] = await tx
      .select()
      .from(integrations)
      .where(eq(integrations.key, key))
      .limit(1);

    return row ?? null;
  }

  async listEnabledKeys(tx: OrgScopedTx): Promise<string[]> {
    const rows = await tx
      .select({ key: integrations.key })
      .from(integrations)
      .where(eq(integrations.enabled, true));

    return rows.map((row) => row.key);
  }

  async update(
    tx: OrgScopedTx,
    key: AppIntegrationKey,
    input: IntegrationUpdateInput,
  ): Promise<IntegrationRow | null> {
    const updateValues: Partial<typeof integrations.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.enabled !== undefined) {
      updateValues.enabled = input.enabled;
    }

    if (input.config !== undefined) {
      updateValues.config = input.config;
    }

    const [row] = await tx
      .update(integrations)
      .set(updateValues)
      .where(eq(integrations.key, key))
      .returning();

    return row ?? null;
  }

  async updateSecrets(
    tx: OrgScopedTx,
    key: AppIntegrationKey,
    secretsEncrypted: string | null,
    secretSalt: string | null,
  ): Promise<IntegrationRow | null> {
    const [row] = await tx
      .update(integrations)
      .set({
        secretsEncrypted,
        secretSalt,
        updatedAt: new Date(),
      })
      .where(eq(integrations.key, key))
      .returning();

    return row ?? null;
  }
}

export const integrationRepository = new IntegrationRepository();
