// Reset script for development database
// Truncates all public tables except migration metadata

import { SQL } from "bun";

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/scheduling";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function reset() {
  console.log("Resetting database...");

  const client = new SQL(databaseUrl);

  try {
    const tables = (await client.unsafe(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '__drizzle_migrations'
      ORDER BY tablename
    `)) as Array<{ tablename: string }>;

    if (tables.length === 0) {
      console.log("No tables found to truncate.");
      return;
    }

    const tableList = tables
      .map((table) => quoteIdentifier(table.tablename))
      .join(", ");

    await client.unsafe(
      `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`,
    );

    console.log(`Truncated ${tables.length} tables.`);
    console.log("Database reset complete.");
  } finally {
    client.close();
  }
}

reset().catch((err) => {
  console.error("Database reset failed:", err);
  process.exit(1);
});
