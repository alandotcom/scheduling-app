// Reset script for development database
// Recreates the whole database (schema + migration metadata)

import { SQL } from "bun";

const appDatabaseUrl =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling_app:scheduling@localhost:5433/scheduling";
const adminDatabaseUrl =
  process.env["DATABASE_ADMIN_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/postgres";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName) {
    throw new Error(
      `DATABASE_URL must include a database name: ${databaseUrl}`,
    );
  }
  return dbName;
}

function getUsername(databaseUrl: string): string | null {
  const url = new URL(databaseUrl);
  return url.username ? decodeURIComponent(url.username) : null;
}

async function reset() {
  const isLocal =
    appDatabaseUrl.includes("localhost") ||
    appDatabaseUrl.includes("127.0.0.1");
  if (!isLocal && process.env["NODE_ENV"] === "production") {
    console.error(
      "ERROR: reset() refused to run — DATABASE_URL does not point to localhost and NODE_ENV is 'production'.",
    );
    process.exit(1);
  }

  const dbName = getDatabaseName(appDatabaseUrl);
  const appUser = getUsername(appDatabaseUrl);

  console.log(`Resetting database '${dbName}'...`);

  const maintenanceUrl = new URL(adminDatabaseUrl);
  maintenanceUrl.pathname = "/postgres";

  const maintenanceClient = new SQL(maintenanceUrl.toString());
  try {
    await maintenanceClient.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${quoteLiteral(dbName)}
        AND pid <> pg_backend_pid()
    `);

    await maintenanceClient.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)};`,
    );

    if (appUser) {
      const roleRows = (await maintenanceClient.unsafe(`
        SELECT 1
        FROM pg_roles
        WHERE rolname = ${quoteLiteral(appUser)}
        LIMIT 1
      `)) as Array<{ "?column?": number }>;

      if (roleRows.length > 0) {
        await maintenanceClient.unsafe(
          `CREATE DATABASE ${quoteIdentifier(dbName)} OWNER ${quoteIdentifier(appUser)};`,
        );
      } else {
        console.warn(
          `Role '${appUser}' not found; creating database '${dbName}' with admin ownership.`,
        );
        await maintenanceClient.unsafe(
          `CREATE DATABASE ${quoteIdentifier(dbName)};`,
        );
      }
    } else {
      await maintenanceClient.unsafe(
        `CREATE DATABASE ${quoteIdentifier(dbName)};`,
      );
    }

    if (appUser) {
      await maintenanceClient.unsafe(
        `GRANT ALL PRIVILEGES ON DATABASE ${quoteIdentifier(dbName)} TO ${quoteIdentifier(appUser)};`,
      );
    }
  } finally {
    await maintenanceClient.close();
  }

  if (appUser) {
    const targetDbAdminUrl = new URL(adminDatabaseUrl);
    targetDbAdminUrl.pathname = `/${dbName}`;

    const targetDbClient = new SQL(targetDbAdminUrl.toString());
    try {
      await targetDbClient.unsafe(
        `GRANT ALL ON SCHEMA public TO ${quoteIdentifier(appUser)};`,
      );
      await targetDbClient.unsafe(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdentifier(appUser)};`,
      );
      await targetDbClient.unsafe(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${quoteIdentifier(appUser)};`,
      );
    } finally {
      await targetDbClient.close();
    }
  }

  console.log("Database reset complete.");
}

reset().catch((err) => {
  console.error("Database reset failed:", err);
  process.exit(1);
});
