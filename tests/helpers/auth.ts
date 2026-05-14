import { expect, type Page } from "@playwright/test";

export async function loginViaDemoUI(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  await expect(page.getByText(/bababuilds erp/i)).toBeVisible();

  await page.getByTestId("demo-auth-section").scrollIntoViewIfNeeded();
  await page.getByTestId("demo-auth-section").click();

  await page.getByTestId("demo-auth-button").click();

  await page.waitForURL(
    (url) => url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/setup"),
    { timeout: 90_000 },
  );
}
