import type { Config } from 'drizzle-kit'

export default {
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://scheduling:scheduling@localhost:5433/scheduling',
  },
} satisfies Config
