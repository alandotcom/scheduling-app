// Test setup - runs automatically before tests via bunfig.toml preload
//
// Creates the test database and runs migrations if needed.
// Sets up an app user without BYPASSRLS for RLS enforcement.

import { SQL } from "bun";

const ADMIN_DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/scheduling";

const TEST_DB_NAME = "scheduling_test";
const APP_USER = "scheduling_app";
const APP_PASSWORD = "scheduling";

// Override DATABASE_URL so all modules use the test database
const TEST_DATABASE_URL = `postgres://${APP_USER}:${APP_PASSWORD}@localhost:5433/${TEST_DB_NAME}`;
process.env["DATABASE_URL"] = TEST_DATABASE_URL;

async function setupTestDatabase() {
  // Connect as admin to main database
  const adminDb = new SQL(ADMIN_DATABASE_URL);

  try {
    // Create test database if needed
    const dbCheck = await adminDb.unsafe(
      `SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'`,
    );

    if (dbCheck.length === 0) {
      console.log(`Creating test database ${TEST_DB_NAME}...`);
      await adminDb.unsafe(`CREATE DATABASE ${TEST_DB_NAME}`);
    }

    // Create app user if needed (no BYPASSRLS for RLS enforcement)
    const userCheck = await adminDb.unsafe(
      `SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}'`,
    );

    if (userCheck.length === 0) {
      console.log(`Creating app user ${APP_USER}...`);
      await adminDb.unsafe(
        `CREATE USER ${APP_USER} WITH PASSWORD '${APP_PASSWORD}'`,
      );
    }
  } finally {
    adminDb.close();
  }

  // Connect as admin to test database
  const testDbAdminUrl = ADMIN_DATABASE_URL.replace(
    /\/[^/]+$/,
    `/${TEST_DB_NAME}`,
  );
  const testDbAdmin = new SQL(testDbAdminUrl);

  try {
    // Always run migrations to ensure schema is up to date
    // drizzle-kit migrate is idempotent - only applies pending migrations
    const proc = Bun.spawn(
      [
        "pnpm",
        "exec",
        "drizzle-kit",
        "migrate",
        "--config=drizzle.test.config.ts",
      ],
      {
        cwd: import.meta.dir + "/..",
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    await proc.exited;
    if (proc.exitCode !== 0) {
      throw new Error("Failed to run migrations on test database");
    }

    // Grant permissions to app user on test database
    await testDbAdmin.unsafe(`GRANT ALL ON SCHEMA public TO ${APP_USER}`);
    await testDbAdmin.unsafe(
      `GRANT ALL ON ALL TABLES IN SCHEMA public TO ${APP_USER}`,
    );
    await testDbAdmin.unsafe(
      `GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER}`,
    );
    await testDbAdmin.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_USER}`,
    );
    await testDbAdmin.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_USER}`,
    );
  } finally {
    testDbAdmin.close();
  }
}

await setupTestDatabase();
