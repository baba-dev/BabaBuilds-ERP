import { expect, test } from "@playwright/test";
import { attachPageTelemetry, dumpTelemetryOnFailure } from "../helpers/telemetry";
import { loginViaDemoUI } from "../helpers/auth";

/**
 * Demo sandbox: visit authenticated routes beyond the main sidebar crawl
 * (settings children, nested hubs, admin). Catches SSR errors, console noise,
 * and failed API calls per route.
 */
const EXTRA_ROUTES = [
  "/settings",
  "/settings/team",
  "/settings/profile",
  "/settings/billing",
  "/settings/imports",
  "/settings/shop",
  "/workforce/leave",
  "/workforce/attendance",
  "/workforce/people",
  "/workforce/reports",
  "/workforce/settings",
  "/cash-flow",
  "/cash-flow/overview",
  "/cash-flow/scenarios",
  "/cash-flow/alerts",
  "/cash-flow/variance",
  "/cash-flow/inflows",
  "/cash-flow/outflows",
  "/cash-flow/assumptions",
  "/cash-flow/manual-adjustments",
  "/documents/inbox",
  "/documents/vault",
  "/documents/compliance",
  "/documents/settings",
  "/invoice",
  "/inbox/import",
  "/payroll/settings",
  "/setup",
  "/launch",
  "/admin",
  "/offline",
  "/help-hub",
] as const;

function snapshotCounts(telemetry: {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}) {
  return {
    consoleErrors: telemetry.consoleErrors.length,
    pageErrors: telemetry.pageErrors.length,
    failedRequests: telemetry.failedRequests.length,
  };
}

function diffSince<T>(arr: T[], start: number) {
  return arr.slice(start);
}

async function dismissBlockingOverlays(page: import("@playwright/test").Page) {
  const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
  if (!(await overlay.isVisible().catch(() => false))) return;

  await page
    .request.patch("/api/user/onboarding", {
      data: { action: "dismiss" },
      headers: { "Content-Type": "application/json" },
    })
    .catch(() => null);

  const continueButton = page.getByRole("button", { name: /continue/i }).first();
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }

  await expect(overlay).toBeHidden({ timeout: 15000 }).catch(() => {});
}

test.describe("Demo sandbox route audit", () => {
  test("extra authenticated routes render without fatal client errors", async ({ page }) => {
    test.setTimeout(240_000);
    const telemetry = attachPageTelemetry(page);

    try {
      await loginViaDemoUI(page);
      await expect(page.locator("main:visible").first()).toBeVisible();
      await dismissBlockingOverlays(page);

      for (const path of EXTRA_ROUTES) {
        const before = snapshotCounts(telemetry);

        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${path} should not 5xx`).toBeLessThan(500);

        // /setup or /launch may redirect; allow that
        await page.waitForLoadState("networkidle").catch(() => {});

        await expect(page.locator("body")).toBeVisible();
        await expect(page).not.toHaveURL(/\/login/);

        const pageErrors = diffSince(telemetry.pageErrors, before.pageErrors);
        const consoleErrors = diffSince(telemetry.consoleErrors, before.consoleErrors);
        const failedRequests = diffSince(telemetry.failedRequests, before.failedRequests);

        expect(pageErrors, `Page errors on ${path}:\n${pageErrors.join("\n")}`).toEqual([]);
        expect(consoleErrors, `Console errors on ${path}:\n${consoleErrors.join("\n")}`).toEqual([]);
        expect(failedRequests, `Failed requests on ${path}:\n${failedRequests.join("\n")}`).toEqual([]);
      }
    } finally {
      await dumpTelemetryOnFailure(test.info(), telemetry);
    }
  });
});
