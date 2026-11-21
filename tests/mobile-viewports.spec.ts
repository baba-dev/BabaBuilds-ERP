import { expect, test } from '@playwright/test';
import { loginViaDemoUI } from './helpers/auth';

/**
 * Phone-width layout audit (Play Store / TWA). The dashboard shell bounds the document and scrolls
 * inside `main`, so overflow is measured on both. Runs against the demo workspace.
 */
const VIEWPORTS = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
] as const;

const ROUTES = [
  '/dashboard',
  '/income',
  '/income/new',
  '/clients',
  '/expenses',
  '/pos',
  '/inventory',
  '/reconciliation',
  '/proposals',
  '/settings',
  '/settings/billing',
  '/reporting',
  '/payroll/settings',
  '/workforce/people',
  '/workforce/leave',
  '/cash-flow',
  '/documents',
  '/import-manager',
  '/tax',
  '/services',
  '/retainers',
  '/inbox',
  '/settings/team',
  '/settings/profile',
  '/help',
] as const;

test.use({ hasTouch: true, isMobile: true });

test('no horizontal overflow on core routes at phone widths', async ({ page }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: VIEWPORTS[0].width, height: VIEWPORTS[0].height });
  await loginViaDemoUI(page);

  const failures: string[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const route of ROUTES) {
      const res = await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => null);
      if (!res || res.status() >= 400) continue;
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const m = await page.evaluate((w) => {
        const main = document.querySelector('main') as HTMLElement | null;
        const wide: string[] = [];
        document.querySelectorAll<HTMLElement>('main *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > w + 1) {
            // ignore elements clipped by a scrollable ancestor
            let p = el.parentElement;
            while (p && p !== document.body) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return;
              p = p.parentElement;
            }
            if (wide.length < 3) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
          }
        });
        return {
          doc: document.documentElement.scrollWidth - window.innerWidth,
          main: main ? main.scrollWidth - main.clientWidth : 0,
          wide,
        };
      }, vp.width);
      if (m.doc > 1 || m.main > 1 || m.wide.length) {
        failures.push(`${vp.width}px ${route}: doc+${m.doc} main+${m.main} ${m.wide.join(' | ')}`);
      }
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
});
