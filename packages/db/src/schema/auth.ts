// Re-export auth-related tables for BetterAuth integration
// These are defined in index.ts but re-exported here for cleaner imports
export {
  users,
  sessions,
  accounts,
  verifications,
  usersRelations,
  sessionsRelations,
  accountsRelations,
} from './index.js'
