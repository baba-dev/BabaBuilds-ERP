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

    // One launcher per demo template (see lib/demo/templates).
    for (const name of [
      /Try Tax Agency Demo/i,
      /Try Digital Marketing Agency Demo/i,
      /Try Contractor & Builder Demo/i,
      /Try Freelancer & Consultant Demo/i,
      /Try Software Company Demo/i,
    ]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }
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
