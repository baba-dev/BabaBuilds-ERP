import { expect, type Page } from '@playwright/test';

export async function loginViaDemoUI(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();

  // Expand demo section and click the CTA that provisions a demo account and signs in.
  await expect(page.getByText(/bababuilds erp/i)).toBeVisible();

  const demoSummary = page.getByText(/need a sandbox instead\\?/i).first();
  await demoSummary.scrollIntoViewIfNeeded();
  await demoSummary.click();

  const demoButton = page.getByRole('button', { name: /try interactive demo|provisioning|demo/i }).first();
  await demoButton.click();

  // Post-login routes can vary; allow `/dashboard` or `/setup` (if workspace context is missing).
  await page.waitForURL(
    (url) =>
      url.origin === 'http://localhost:3000' &&
      (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/setup')),
    { timeout: 25000 }
  );
}

