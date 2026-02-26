import { defineConfig } from "evalite/config";
import { createSqliteStorage } from "evalite/sqlite-storage";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  storage: () => createSqliteStorage(".evalite/evalite.db"),
  testTimeout: 60_000,
  maxConcurrency: 3,
  setupFiles: ["./src/evals/setup.ts"],
  cache: true,
  server: { port: 3006 },
  viteConfig: {
    plugins: [tsconfigPaths({ root: "../../" })],
  },
});
