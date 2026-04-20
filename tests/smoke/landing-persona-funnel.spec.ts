import { expect, test } from "@playwright/test";

test.describe("Landing persona conversion funnel", () => {
  test("homepage exposes primary conversion CTAs", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("link", { name: /Start 15-Day Pro Trial/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Explore Interactive Demo/i }).first(),
    ).toBeVisible();
  });

  test("homepage role demo launcher shows all role entries", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: /Try CA Demo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try Agency Demo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try Contractor Demo/i })).toBeVisible();
  });

  test("persona pages render trial + demo CTAs", async ({ page }) => {
    const personaRoutes = [
      "/for-ca",
      "/for-agencies",
      "/for-contractors",
      "/for-small-businesses",
      "/for-freelancers",
    ];

    for (const route of personaRoutes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: /Start 15-Day Pro Trial/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Try Live Demo/i })).toBeVisible();
    }
  });
});
