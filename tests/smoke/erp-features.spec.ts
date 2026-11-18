import { expect, test } from "@playwright/test";
import { erpFeatures } from "../../content/marketing/erp-features";
import { featureHref, FEATURES_PATH, OPTIONAL_MODULES_PATH, optionalFeatureSlugs } from "../../content/marketing/feature-paths";

const origin = "https://erp.bababuilds.com";

test("public ERP feature pages are linked and discoverable", async ({ page, request }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(`nav a[href="${FEATURES_PATH}"]`).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse all optional modules" })).toHaveAttribute("href", OPTIONAL_MODULES_PATH);
  await expect(page.locator(`a[href="${featureHref(optionalFeatureSlugs.POS)}"]`)).toBeVisible();
  await expect(page.locator(`a[href="${featureHref(optionalFeatureSlugs.SHOP)}"]`)).toBeVisible();

  await page.goto(FEATURES_PATH, { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", origin + FEATURES_PATH);

  const optionalModules = page.getByRole("region", { name: "Optional modules" });
  await expect(optionalModules.getByRole("link", { name: /Point of sale/ })).toBeVisible();
  await expect(optionalModules.getByRole("link", { name: /Online shop/ })).toBeVisible();

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const sitemapXml = await sitemap.text();
  expect(sitemapXml).toContain(`<loc>${origin}${FEATURES_PATH}</loc>`);

  for (const feature of erpFeatures) {
    const href = featureHref(feature.slug);
    await expect(page.locator(`main a[href="${href}"]`)).toBeVisible();
    expect(sitemapXml).toContain(`<loc>${origin}${href}</loc>`);
  }
});

test("feature pages return public HTML and page-specific metadata", async ({ request }) => {
  test.setTimeout(90_000);
  for (const feature of erpFeatures) {
    const href = featureHref(feature.slug);
    const response = await request.get(href, { headers: { "user-agent": "Googlebot" } });
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(`<title>${feature.title} | BabaBuilds ERP</title>`);
    expect(html).toContain(`<link rel="canonical" href="${origin}${href}"`);
    expect(html).toContain(feature.headline);
  }

  const missing = await request.get("/features/unknown-feature", { headers: { "user-agent": "Googlebot" } });
  expect(missing.status()).toBe(404);
});

test("an optional feature offers a working mobile workflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(featureHref(optionalFeatureSlugs.POS), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Start a free trial" }).first()).toHaveAttribute(
    "href",
    "/signup?plan=pro&cycle=monthly&trial=15&source=feature-point-of-sale",
  );

  await page.getByRole("link", { name: "See how it works" }).click();
  await expect(page).toHaveURL(/#workflow$/);
  await expect(page.getByRole("heading", { name: "How it works" })).toBeInViewport();

  const question = page.locator("details").first();
  await question.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(question).toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole("navigation", { name: "Related features" }).getByRole("link", { name: "Online shop" }).click();
  await expect(page).toHaveURL(new RegExp(`${featureHref(optionalFeatureSlugs.SHOP)}$`));
});
