import { test, expect } from "./fixtures";

test.describe("Locations CRUD", () => {
  test("navigates to locations page and shows content", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/locations");
    await expect(
      page.getByRole("heading", { name: "Locations" }),
    ).toBeVisible();
  });

  test("can create a location", async ({ authenticatedPage: page }) => {
    await page.goto("/locations");

    // Click Add Location button
    await page.click('button:has-text("Add Location")');

    // Fill the form
    const locationName = `Test Location ${Date.now()}`;
    await page.fill('input[id="name"]', locationName);

    // Timezone is already defaulted to America/New_York, so we can just submit

    // Submit
    await page.click('button[type="submit"]:has-text("Save")');

    // Verify success toast
    await expect(page.getByText("Location created successfully")).toBeVisible();

    // Verify location appears in table
    await expect(page.getByText(locationName)).toBeVisible();
  });

  test("can edit a location", async ({ authenticatedPage: page }) => {
    await page.goto("/locations");

    // First create a location to edit
    await page.click('button:has-text("Add Location")');
    const originalName = `Edit Test ${Date.now()}`;
    await page.fill('input[id="name"]', originalName);
    // Timezone is already defaulted
    await page.click('button[type="submit"]:has-text("Save")');
    await expect(page.getByText("Location created successfully")).toBeVisible();

    // Wait for location to appear
    await expect(page.getByText(originalName)).toBeVisible();

    // Click edit button for the created location
    const row = page.getByRole("row").filter({ hasText: originalName });
    await row.getByRole("button", { name: "Edit location" }).click();

    // Modify the name
    const updatedName = `${originalName} Updated`;
    await page.fill('input[id="name"]', updatedName);
    await page.click('button[type="submit"]:has-text("Save")');

    // Verify success toast
    await expect(page.getByText("Location updated successfully")).toBeVisible();

    // Verify updated name appears
    await expect(page.getByText(updatedName)).toBeVisible();
  });

  test("can delete a location", async ({ authenticatedPage: page }) => {
    await page.goto("/locations");

    // First create a location to delete
    await page.click('button:has-text("Add Location")');
    const locationName = `Delete Test ${Date.now()}`;
    await page.fill('input[id="name"]', locationName);
    // Timezone is already defaulted
    await page.click('button[type="submit"]:has-text("Save")');
    await expect(page.getByText("Location created successfully")).toBeVisible();

    // Wait for location to appear
    await expect(page.getByText(locationName)).toBeVisible();

    // Click delete button
    const row = page.getByRole("row").filter({ hasText: locationName });
    await row.getByRole("button", { name: "Delete location" }).click();

    // Confirm deletion in dialog
    await page.click('button:has-text("Delete")');

    // Verify success toast
    await expect(page.getByText("Location deleted successfully")).toBeVisible();

    // Verify location no longer appears
    await expect(page.getByText(locationName)).not.toBeVisible();
  });
});
