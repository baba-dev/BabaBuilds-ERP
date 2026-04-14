import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {
  test('public landing loads without console errors', async ({ page }) => {
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') consoleMessages.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('requestfailed', (req) => {
      const failure = req.failure();
      failedRequests.push(`${req.method()} ${req.url()} ${failure?.errorText ?? ''}`.trim());
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveTitle(/BabaBuilds|ERP/i);

    // Allow any late client-side errors to surface
    await page.waitForTimeout(500);

    expect(pageErrors, `Page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleMessages, `Console errors:\n${consoleMessages.join('\n')}`).toEqual([]);
    expect(failedRequests, `Failed requests:\n${failedRequests.join('\n')}`).toEqual([]);
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
