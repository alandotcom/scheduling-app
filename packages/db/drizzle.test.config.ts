import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/index.ts",
  schemaFilter: ["public"],
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Hardcoded for CLI usage - test-setup.ts sets DATABASE_URL at runtime
    url: "postgres://scheduling:scheduling@localhost:5433/scheduling_test",
  },
} satisfies Config;
