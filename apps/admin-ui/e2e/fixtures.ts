import { test as base, expect, type Page } from "@playwright/test";

// Test credentials (from seed.ts)
const TEST_USER = {
  email: "admin@example.com",
  password: "password123",
};

// Helper to login and return authenticated page
async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForURL("/", { timeout: 10000 });
}

// Extend base test with authenticated page fixture
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect };
