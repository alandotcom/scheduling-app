// Configuration loaded from environment variables

export const config = {
  server: {
    port: Number(process.env['PORT'] ?? 3000),
  },
  db: {
    // Use TEST_DATABASE_URL in tests, otherwise DATABASE_URL
    url: process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'] ?? 'postgres://scheduling:scheduling@localhost:5433/scheduling',
  },
  auth: {
    secret: process.env['AUTH_SECRET'] ?? 'dev-secret-change-in-production',
    baseUrl: process.env['AUTH_BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3000}`,
  },
  valkey: {
    host: process.env['VALKEY_HOST'] ?? 'localhost',
    port: Number(process.env['VALKEY_PORT'] ?? 6380),
  },
} as const

export type Config = typeof config
