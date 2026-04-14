import { test, expect } from '@playwright/test';
import { attachPageTelemetry, dumpTelemetryOnFailure } from './helpers/telemetry';
import { loginViaDemoUI } from './helpers/auth';

type SidebarLink = { label: string; href: string };

function snapshotCounts(telemetry: { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[] }) {
  return {
    consoleErrors: telemetry.consoleErrors.length,
    pageErrors: telemetry.pageErrors.length,
    failedRequests: telemetry.failedRequests.length,
  };
}

function diffSince<T>(arr: T[], start: number) {
  return arr.slice(start);
}

function normalizeHref(rawHref: string) {
  try {
    const url = new URL(rawHref, 'http://localhost:3000');
    return url.pathname + url.search + url.hash;
  } catch {
    return rawHref;
  }
}

async function getSidebarLinks(page): Promise<SidebarLink[]> {
  const rawLinks = await page
    .locator('aside[data-slot="sidebar"] nav a[href^="/"]')
    .evaluateAll((anchors: HTMLAnchorElement[]) =>
      anchors
        .map((a) => ({
          href: a.getAttribute('href') ?? '',
          label: (a.textContent ?? '').trim().replace(/\s+/g, ' '),
        }))
        .filter((x) => x.href && x.label),
    );

  // Deduplicate, keeping first occurrence to preserve displayed order.
  const seen = new Set<string>();
  const deduped: SidebarLink[] = [];
  for (const link of rawLinks) {
    const href = normalizeHref(link.href);
    if (seen.has(href)) continue;
    seen.add(href);
    deduped.push({ ...link, href });
  }
  return deduped;
}

async function dismissBlockingOverlays(page) {
  // Known blocker: onboarding dialog overlay can remain open post-login and intercept sidebar clicks.
  // Best-effort fix: use the authenticated browser session to dismiss onboarding via API.
  const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
  if (!(await overlay.isVisible().catch(() => false))) return;

  const res = await page
    .request
    .patch('/api/user/onboarding', {
      data: { action: 'dismiss' },
      headers: { 'Content-Type': 'application/json' },
    })
    .catch(() => null);

  // Fallbacks for any other modal overlays.
  const continueButton = page.getByRole('button', { name: /continue/i }).first();
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }

  // If the API call failed (e.g. not authenticated yet), give the UI a moment to settle.
  if (res && !res.ok()) {
    await page.waitForTimeout(250);
  }

  await expect(overlay).toBeHidden({ timeout: 15000 }).catch(() => {});
}

async function waitForPageReady(page) {
  // Some layouts temporarily render multiple <main> elements during transitions/loading.
  // Use the first visible one as the readiness signal.
  await expect(page.locator('main:visible').first()).toBeVisible();
  // Many pages load data after hydration; allow a short window for late errors.
  await page.waitForTimeout(250);
}

test.describe('Sidebar crawler', () => {
  test('clicks each sidebar item in order (captures console/network failures)', async ({ page }) => {
    test.setTimeout(120_000);
    const telemetry = attachPageTelemetry(page);

    try {
      await loginViaDemoUI(page);
      await waitForPageReady(page);
      await dismissBlockingOverlays(page);

      // Ensure sidebar is present (desktop view in CI/local runner).
      await expect(page.locator('aside[data-slot="sidebar"]')).toBeVisible();

      const links = await getSidebarLinks(page);
      expect(links.length, 'Expected at least 8 sidebar links').toBeGreaterThanOrEqual(8);

      // Crawl in the order rendered by the app (sidebar order is the source of truth).
      for (const link of links) {
        await dismissBlockingOverlays(page);

        const before = snapshotCounts(telemetry);
        // Click by href for robustness (labels are localized).
        // The brand link at the very top also points to /dashboard; choose the nav link when duplicates exist.
        const sidebarLink = page.locator(`aside[data-slot="sidebar"] nav a[href="${link.href}"]`).first();
        await expect(sidebarLink, `Sidebar link not found: ${link.label} (${link.href})`).toBeVisible();

        const startingPathname = page.url() ? new URL(page.url()).pathname : '';
        await sidebarLink.click();
        await page
          .waitForURL((url) => url.pathname.startsWith(link.href), { timeout: 25000 })
          .catch(async () => {
            // Some routes include nested segments; fall back to exact match before failing.
            await page.waitForURL((url) => url.pathname === link.href, { timeout: 2500 });
          })
          .catch(async () => {
            // If we're already on the target route (e.g. first item is /dashboard), no navigation will occur.
            const currentPathname = new URL(page.url()).pathname;
            expect(
              currentPathname === link.href || currentPathname.startsWith(link.href),
              `Expected to be on ${link.href} (started at ${startingPathname}, now at ${currentPathname})`,
            ).toBeTruthy();
          });

        await waitForPageReady(page);

        // Active highlight: sidebar uses `bg-indigo-600` for active links.
        await expect(sidebarLink).toHaveClass(/bg-indigo-600/);

        // Auth/session smoke: no redirect loops back to login.
        await expect(page).not.toHaveURL(/\/login/);

        // Network/console failure smoke per page (use deltas so earlier errors don't poison later pages).
        const pageErrors = diffSince(telemetry.pageErrors, before.pageErrors);
        const consoleErrors = diffSince(telemetry.consoleErrors, before.consoleErrors);
        const failedRequests = diffSince(telemetry.failedRequests, before.failedRequests);

        expect(pageErrors, `Page errors on ${link.href}:\n${pageErrors.join('\n')}`).toEqual([]);
        expect(consoleErrors, `Console errors on ${link.href}:\n${consoleErrors.join('\n')}`).toEqual([]);
        expect(failedRequests, `Failed requests on ${link.href}:\n${failedRequests.join('\n')}`).toEqual([]);
      }

      // Global request smoke (allow 401/403 for explicitly protected endpoints? For now: none).
      expect(telemetry.failedRequests, `Failed requests:\n${telemetry.failedRequests.join('\n')}`).toEqual([]);
    } finally {
      await dumpTelemetryOnFailure(test.info(), telemetry);
    }
  });
});

