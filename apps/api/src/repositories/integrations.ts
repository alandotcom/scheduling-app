import { and, eq } from "drizzle-orm";
import { integrations } from "@scheduling/db/schema";
import type { AppIntegrationKey } from "@scheduling/dto";
import type { DbClient } from "../lib/db.js";

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
    tx: DbClient,
    orgId: string,
    defaults: readonly IntegrationDefaultsInput[],
  ): Promise<void> {
    if (defaults.length === 0) {
      return;
    }

    await tx
      .insert(integrations)
      .values(
        defaults.map((item) => ({
          orgId,
          key: item.key,
          enabled: item.enabled,
          config: item.config,
        })),
      )
      .onConflictDoNothing({
        target: [integrations.orgId, integrations.key],
      });
  }

  async listByOrg(tx: DbClient, orgId: string): Promise<IntegrationRow[]> {
    return tx.select().from(integrations).where(eq(integrations.orgId, orgId));
  }

  async findByKey(
    tx: DbClient,
    orgId: string,
    key: AppIntegrationKey,
  ): Promise<IntegrationRow | null> {
    const [row] = await tx
      .select()
      .from(integrations)
      .where(and(eq(integrations.orgId, orgId), eq(integrations.key, key)))
      .limit(1);

    return row ?? null;
  }

  async listEnabledKeys(tx: DbClient, orgId: string): Promise<string[]> {
    const rows = await tx
      .select({ key: integrations.key })
      .from(integrations)
      .where(
        and(eq(integrations.orgId, orgId), eq(integrations.enabled, true)),
      );

    return rows.map((row) => row.key);
  }

  async update(
    tx: DbClient,
    orgId: string,
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
      .where(and(eq(integrations.orgId, orgId), eq(integrations.key, key)))
      .returning();

    return row ?? null;
  }

  async updateSecrets(
    tx: DbClient,
    orgId: string,
    key: AppIntegrationKey,
    secretsEncrypted: string,
    secretSalt: string,
  ): Promise<IntegrationRow | null> {
    const [row] = await tx
      .update(integrations)
      .set({
        secretsEncrypted,
        secretSalt,
        updatedAt: new Date(),
      })
      .where(and(eq(integrations.orgId, orgId), eq(integrations.key, key)))
      .returning();

    return row ?? null;
  }
}

export const integrationRepository = new IntegrationRepository();
