// Global test setup for bun test
//
// This module provides hooks for test lifecycle management.
// Use createTestDb/resetTestDb/closeTestDb from @scheduling/db/test-utils
// in your test files with beforeAll/beforeEach/afterAll.

import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
  clearTestOrgContext,
} from "@scheduling/db/test-utils";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

export type TestDatabase = BunSQLDatabase<typeof schema, typeof relations>;

// Re-export db utilities for convenience
export {
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
  clearTestOrgContext,
};

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
  let db: TestDatabase | null = null;

  return {
    /**
     * Initialize the test database. Call in beforeAll.
     */
    async init(): Promise<TestDatabase> {
      db = (await createTestDb()) as TestDatabase;
      return db;
    },

    /**
     * Get the current database instance.
     * Throws if init() hasn't been called.
     */
    getDb(): TestDatabase {
      if (!db) {
        throw new Error(
          "Test database not initialized. Call init() in beforeAll first.",
        );
      }
      return db;
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
      await closeTestDb();
      db = null;
    },

    /**
     * Set org context for RLS. Call before queries that need org scope.
     */
    async setOrgContext(orgId: string): Promise<void> {
      if (!db) {
        throw new Error("Test database not initialized.");
      }
      await setTestOrgContext(db, orgId);
    },

    /**
     * Clear org context. Call after org-scoped operations.
     */
    async clearOrgContext(): Promise<void> {
      if (!db) {
        throw new Error("Test database not initialized.");
      }
      await clearTestOrgContext(db);
    },
  };
}
