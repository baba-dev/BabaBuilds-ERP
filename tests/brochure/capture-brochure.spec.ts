import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  brochureAuthenticatedRoutes,
  brochurePublicRoutes,
} from "../../docs/sales-brochure/brochure-routes";
import {
  assertPngNotBlank,
  dismissBlockingOverlays,
  loginViaDemoSoftwareCompany,
} from "../helpers/brochure-capture-helpers";

const ROOT = path.join(process.cwd(), "docs/sales-brochure");
const OUT = path.join(ROOT, "assets/screenshots");
const MANIFEST = path.join(ROOT, "brochure-manifest.json");

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 1440, height: 900 } });

async function captureViewport(page: import("@playwright/test").Page, id: string) {
  const file = path.join(OUT, `${id}.png`);
  await page.screenshot({ path: file, type: "png", fullPage: false });
  assertPngNotBlank(file);
  return `assets/screenshots/${id}.png`;
}

test("capture brochure screenshots for distribution pack", async ({ page }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(OUT, { recursive: true });

  const manifest: Record<string, { relPath: string; title: string; section: string }> = {};

  for (const r of brochurePublicRoutes) {
    const res = await page.goto(r.path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    expect(res?.status(), `${r.path} status`).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
    const rel = await captureViewport(page, r.id);
    manifest[r.id] = { relPath: rel, title: r.title, section: r.section };
  }

  await loginViaDemoSoftwareCompany(page);
  await dismissBlockingOverlays(page);

  for (const r of brochureAuthenticatedRoutes) {
    const res = await page.goto(r.path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    expect(res?.status(), `${r.path} status`).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
    await dismissBlockingOverlays(page);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 }).catch(() => {});
    const rel = await captureViewport(page, r.id);
    manifest[r.id] = { relPath: rel, title: r.title, section: r.section };
  }

  const pr = await page.request.get("/api/proposals");
  expect(pr.ok()).toBeTruthy();
  const proposals = (await pr.json()) as Array<{ id?: string }>;
  const proposalId = proposals[0]?.id;
  if (proposalId) {
    const p = `/proposals/${proposalId}`;
    const res = await page.goto(p, { waitUntil: "domcontentloaded", timeout: 120_000 });
    expect(res?.status(), p).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
    await dismissBlockingOverlays(page);
    const rel = await captureViewport(page, "proposal_detail");
    manifest.proposal_detail = { relPath: rel, title: "Proposal detail", section: "sales" };
  }

  const po = await page.request.get("/api/payroll/overview");
  if (po.ok()) {
    const overview = (await po.json()) as {
      periods?: Array<{ latestRun?: { id?: string } | null }>;
    };
    const runId = overview.periods?.find((x) => x.latestRun?.id)?.latestRun?.id;
    if (runId) {
      const p = `/payroll/runs/${runId}`;
      const res = await page.goto(p, { waitUntil: "domcontentloaded", timeout: 120_000 });
      expect(res?.status(), p).toBeLessThan(500);
      await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
      await dismissBlockingOverlays(page);
      const rel = await captureViewport(page, "payroll_run_detail");
      manifest.payroll_run_detail = {
        relPath: rel,
        title: "Payroll run detail",
        section: "workspace",
      };
    }
  }

  const shopRes = await page.request.get("/api/shop/settings");
  if (shopRes.ok()) {
    const shopData = (await shopRes.json()) as { shopSlug?: string | null };
    const slug = shopData.shopSlug?.trim();
    if (slug) {
      const p = `/shop/${slug}`;
      const res = await page.goto(p, { waitUntil: "domcontentloaded", timeout: 120_000 });
      expect(res?.status(), p).toBeLessThan(500);
      await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
      const rel = await captureViewport(page, "public_shop");
      manifest.public_shop = { relPath: rel, title: "Public storefront", section: "public_shop" };
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), shots: manifest }, null, 2));
});
