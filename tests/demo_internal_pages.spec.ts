import { test, expect } from "@playwright/test";

test.describe("Demo auth internal pages", () => {
  test("can provision demo and reach dashboard", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("demo-auth-section").click();
    await page.getByTestId("demo-auth-button").click();

    await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000, waitUntil: "load" });
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard(\/|$)/);
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page).not.toHaveURL(/\/login/);
  });
});

