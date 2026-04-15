import { test, expect } from '@playwright/test';
import { attachPageTelemetry, dumpTelemetryOnFailure } from './helpers/telemetry';

test.describe('Smoke Test', () => {
  test('public landing loads without console errors', async ({ page }) => {
    const telemetry = attachPageTelemetry(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/BabaBuilds|ERP/i);

    // Allow any late client-side errors to surface
    await page.waitForTimeout(500);

    try {
      expect(telemetry.pageErrors, `Page errors:\n${telemetry.pageErrors.join('\n')}`).toEqual([]);
      expect(telemetry.consoleErrors, `Console errors:\n${telemetry.consoleErrors.join('\n')}`).toEqual([]);
      expect(telemetry.failedRequests, `Failed requests:\n${telemetry.failedRequests.join('\n')}`).toEqual([]);
    } finally {
      // Attach on failure for easier debugging in Playwright HTML report.
      // (No-op when the test passes.)
      await dumpTelemetryOnFailure(test.info(), telemetry);
    }
  });

  test('can reach login page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
  });

  test('demo auth endpoint works', async ({ request }) => {
    const res = await request.post('/api/auth/demo', { data: {} });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('email');
    expect(data).toHaveProperty('password');
  });

  test('demo account can sign in via UI', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();

    // Expand demo section and click the CTA that provisions a demo account and calls next-auth signIn("demo-login").
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
      { timeout: 20000 }
    );
  });
});
