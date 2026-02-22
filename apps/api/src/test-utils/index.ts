// Test utilities barrel export
//
// Usage:
//   import { createTestContext, createOrg, setupTestDb } from '../test-utils/index.js'

// Context utilities
export {
  createTestContext,
  createUnauthenticatedContext,
  createTokenContext,
  type TestContextOptions,
} from "./context.js";

// Factory functions
export {
  createOrg,
  createOrgMember,
  createLocation,
  createCalendar,
  createAppointmentType,
  createResource,
  createClient,
  createAppointment,
  createAvailabilityRule,
  createAvailabilityOverride,
  createBlockedTime,
  createSchedulingLimits,
  insertManyWithOrgContext,
  createRouteTestContext,
  createSchedulingFixtureFast,
  createTestFixture,
  createQuickAppointment,
} from "./factories.js";

// Setup utilities
export {
  setupTestDb,
  getTestDb,
  createTestDb,
  resetTestDb,
  closeTestDb,
  registerDbTestReset,
  setTestOrgContext,
  clearTestOrgContext,
  type DbResetMode,
  type TestDatabase,
} from "./setup.js";

// Re-export from @scheduling/db/test-utils for convenience
export {
  seedTestOrg,
  seedSecondTestOrg,
  withTestOrgContext,
} from "@scheduling/db/test-utils";
