import { expect, test, type Page } from '@playwright/test';

async function openDemoDashboard(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('demo-auth-section').click();
  await page.getByTestId('demo-auth-button').click();

  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 90_000 });
  await expect(page.locator('main.dashboard-motion-surface')).toBeVisible();
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('dashboard shell layout', () => {
  test('bounds the document and makes dashboard main the vertical scroll container', async ({ page }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1280, height: 640 });
    await openDemoDashboard(page);

    const metrics = await page.evaluate(() => {
      const main = document.querySelector('main.dashboard-motion-surface') as HTMLElement | null;
      const sidebar = document.querySelector('aside[data-slot="sidebar"]') as HTMLElement | null;

      if (!main) {
        throw new Error('Dashboard main scroll container was not found.');
      }

      const mainStyle = window.getComputedStyle(main);
      const sidebarRect = sidebar?.getBoundingClientRect();

      return {
        documentScrollHeight: document.documentElement.scrollHeight,
        mainClientHeight: main.clientHeight,
        mainOverflowY: mainStyle.overflowY,
        mainScrollHeight: main.scrollHeight,
        sidebarHeight: sidebarRect?.height ?? 0,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics.documentScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(metrics.mainOverflowY).toBe('auto');
    expect(metrics.mainScrollHeight).toBeGreaterThanOrEqual(metrics.mainClientHeight);
    expect(metrics.sidebarHeight).toBeGreaterThanOrEqual(metrics.viewportHeight - 1);
    expect(metrics.sidebarHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  });
});
