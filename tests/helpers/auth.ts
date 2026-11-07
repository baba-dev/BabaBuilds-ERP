import { expect, type Page } from "@playwright/test";

export async function loginViaDemoUI(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  // Stable hook instead of brand copy: the login heading text changes with branding/i18n.
  await expect(page.getByTestId("demo-auth-section")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("demo-auth-section").scrollIntoViewIfNeeded();
  await page.getByTestId("demo-auth-section").click();

  await page.getByTestId("demo-auth-button").click();

  await page.waitForURL(
    (url) => url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/setup"),
    { timeout: 90_000 },
  );
}
