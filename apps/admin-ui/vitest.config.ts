import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Playwright specs live in e2e/ and should not run in vitest.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "**/e2e/**", "**/node_modules/**"],
  },
});
