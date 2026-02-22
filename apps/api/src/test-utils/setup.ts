// Global test setup for bun test
//
// This module provides hooks for test lifecycle management.
// Use createTestDb/resetTestDb/closeTestDb from @scheduling/db/test-utils
// in your test files with beforeAll/beforeEach/afterAll.

import { beforeAll, beforeEach } from "bun:test";
import {
  getTestDb as getRawTestDb,
  resetTestDb as resetRawTestDb,
  closeTestDb as closeRawTestDb,
  setTestOrgContext,
  clearTestOrgContext,
  type TestDatabase,
} from "@scheduling/db/test-utils";

export type { TestDatabase };

export function getTestDb(): TestDatabase {
  return getRawTestDb();
}

export async function createTestDb(): Promise<TestDatabase> {
  return getRawTestDb();
}

export async function resetTestDb(db?: TestDatabase): Promise<void> {
  await resetRawTestDb(db ?? getRawTestDb());
}

export async function closeTestDb(db?: TestDatabase): Promise<void> {
  if (!db) return;
  await closeRawTestDb(db);
}

export type DbResetMode = "per-test" | "per-file";

/**
 * Register DB reset hooks for the current test file/describe scope.
 *
 * - per-test: reset before each test (strict isolation)
 * - per-file: reset once before the file/scope (faster for read-only suites)
 */
export function registerDbTestReset(mode: DbResetMode = "per-test"): void {
  if (mode === "per-file") {
    beforeAll(async () => {
      await resetRawTestDb(getRawTestDb());
    });
    return;
  }

  beforeEach(async () => {
    await resetRawTestDb(getRawTestDb());
  });
}

export { setTestOrgContext, clearTestOrgContext };

/**
 * Setup helper that initializes the test database and provides
 * common hooks for test files.
 *
 * @example
 * ```ts
 * import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
 * import { setupTestDb } from '../test-utils/setup.js'
 *
 * describe('My Route', () => {
 *   const { getDb, reset } = setupTestDb()
 *
 *   beforeEach(async () => {
 *     await reset()
 *   })
 *
 *   test('should work', async () => {
 *     const db = getDb()
 *     // use db...
 *   })
 * })
 * ```
 */
export function setupTestDb() {
  return {
    /**
     * Initialize the test database. Call in beforeAll.
     */
    async init(): Promise<TestDatabase> {
      return getRawTestDb();
    },

    /**
     * Get the current database instance.
     * Throws if init() hasn't been called.
     */
    getDb(): TestDatabase {
      return getRawTestDb();
    },

    /**
     * Reset the database by truncating all tables.
     * Call in beforeEach for test isolation.
     */
    async reset(): Promise<void> {
      await resetTestDb();
    },

    /**
     * Close the database connection. Call in afterAll.
     */
    async close(): Promise<void> {
      // Managed by test preload lifecycle.
      return;
    },

    /**
     * Set org context for RLS. Call before queries that need org scope.
     */
    async setOrgContext(orgId: string): Promise<void> {
      await setTestOrgContext(getRawTestDb(), orgId);
    },

    /**
     * Clear org context. Call after org-scoped operations.
     */
    async clearOrgContext(): Promise<void> {
      await clearTestOrgContext(getRawTestDb());
    },
  };
}
