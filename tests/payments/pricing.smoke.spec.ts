import { test, expect } from "@playwright/test";

test.describe("Marketing pricing (multi-region)", () => {
  test("landing pricing section shows regional catalog controls", async ({ page }) => {
    await page.goto("/#pricing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "INR" })).toBeVisible();
    await expect(page.getByRole("button", { name: "EUR" })).toBeVisible();
    await expect(page.getByRole("button", { name: "OMR" })).toBeVisible();
  });
});
