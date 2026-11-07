import { expect, test } from "@playwright/test";

/**
 * Smoke tests for broken UI / fatal server errors on key routes.
 * Run: `npx playwright test tests/smoke/ui-pages.spec.ts`
 *
 * These catch cases where the app builds but SSR throws (e.g. env/config)
 * and every page returns 500.
 */
test.describe("Critical pages render", () => {
  test("landing page loads without server error", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "networkidle" });
    expect(response?.status(), "home should not 5xx").toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    // Primary CTA on marketing (copy is localized and changes: trial / demo / sign-in wording)
    await expect(
      page
        .getByRole("link", { name: /start .*trial|explore interactive demo|get started|sign in|log in/i })
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("login page loads without server error", async ({ page }) => {
    const response = await page.goto("/login", { waitUntil: "networkidle" });
    expect(response?.status(), "login should not 5xx").toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });

  test("help layout responds (public docs surface)", async ({ page }) => {
    const response = await page.goto("/help", { waitUntil: "domcontentloaded" });
    // May redirect or 404 if route differs; still must not 500
    expect(response?.status(), "help should not 5xx").toBeLessThan(500);
  });
});
