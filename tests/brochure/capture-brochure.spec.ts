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
const PRODUCT_IMAGES = path.join(process.cwd(), "docs/product-images");
const MANIFEST = path.join(ROOT, "brochure-manifest.json");
const PRODUCT_MANIFEST = path.join(PRODUCT_IMAGES, "manifest.json");
const THEMES = ["light", "dark"] as const;
const CAPTURE_THEMES = process.env.CAPTURE_THEME
  ? THEMES.filter((theme) => theme === process.env.CAPTURE_THEME)
  : THEMES;

if (CAPTURE_THEMES.length === 0) {
  throw new Error(`CAPTURE_THEME must be one of: ${THEMES.join(", ")}`);
}

test.describe.configure({ mode: "serial" });

test.use({ viewport: { width: 1440, height: 900 } });

async function captureViewport(
  page: import("@playwright/test").Page,
  id: string,
  theme: (typeof THEMES)[number],
) {
  const themeOut = path.join(PRODUCT_IMAGES, "screenshots", theme);
  fs.mkdirSync(themeOut, { recursive: true });
  const file = path.join(themeOut, `${id}.png`);
  if (!(process.env.CAPTURE_RESUME === "1" && fs.existsSync(file))) {
    await page.addStyleTag({
      content:
        '[data-sonner-toaster], [data-radix-toast-viewport], nextjs-portal { display: none !important; }',
    });
    await page.evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((portal) => portal.remove());
    });
    await page.screenshot({ path: file, type: "png", fullPage: false });
  }
  assertPngNotBlank(file);
  if (theme === "light") {
    fs.copyFileSync(file, path.join(OUT, `${id}.png`));
  }
  return `screenshots/${theme}/${id}.png`;
}

async function waitForSettledUi(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll<HTMLElement>(".animate-pulse")).some((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width >= 80 &&
          rect.height >= 40 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0
        );
      }),
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(500);
}

test("capture current product pages in light and dark modes", async ({ browser }) => {
  test.setTimeout(1_200_000);
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(PRODUCT_IMAGES, { recursive: true });

  const manifest: Record<
    string,
    { paths: Record<(typeof THEMES)[number], string>; title: string; section: string; route: string }
  > = {};
  const requestedIds = process.env.CAPTURE_IDS
    ? new Set(process.env.CAPTURE_IDS.split(",").map((id) => id.trim()).filter(Boolean))
    : null;
  const isRequested = (id: string) => requestedIds === null || requestedIds.has(id);
  const initialTheme = CAPTURE_THEMES.length === 1 ? CAPTURE_THEMES[0] : "light";
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: initialTheme,
  });
  await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), initialTheme);
  const page = await context.newPage();

  const imagePath = (id: string, theme: (typeof THEMES)[number]) =>
    path.join(PRODUCT_IMAGES, "screenshots", theme, `${id}.png`);
  const pairExists = (id: string) =>
    THEMES.every((theme) => fs.existsSync(imagePath(id, theme)));
  const register = (id: string, title: string, section: string, route: string) => {
    manifest[id] = {
      paths: { light: `screenshots/light/${id}.png`, dark: `screenshots/dark/${id}.png` },
      title,
      section,
      route,
    };
  };
  const applyTheme = async (theme: (typeof THEMES)[number]) => {
    if (page.url() === "about:blank") return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.evaluate((selectedTheme) => {
          window.localStorage.setItem("theme", selectedTheme);
          document.documentElement.classList.remove("light", "dark");
          document.documentElement.classList.add(selectedTheme);
          document.documentElement.style.colorScheme = selectedTheme;
        }, theme);
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed") || attempt === 2) {
          throw error;
        }
        await page.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
      }
    }
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await page.waitForTimeout(250);
  };
  const capturePair = async (id: string) => {
    for (const theme of CAPTURE_THEMES) {
      await applyTheme(theme);
      await captureViewport(page, id, theme);
    }
    await applyTheme("light");
  };
  const prepareRoute = async (route: string, authenticated: boolean) => {
    await applyTheme("light");
    const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 120_000 });
    if (res) expect(res.status(), `${route} status`).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 1_500 }).catch(() => {});
    if (authenticated) {
      await dismissBlockingOverlays(page);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    }
    await waitForSettledUi(page);
  };

  for (const r of brochurePublicRoutes) {
    if (!isRequested(r.id)) continue;
    if (!(process.env.CAPTURE_RESUME === "1" && pairExists(r.id))) {
      await prepareRoute(r.path, false);
      await capturePair(r.id);
    } else {
      for (const theme of THEMES) assertPngNotBlank(imagePath(r.id, theme));
    }
    register(r.id, r.title, r.section, r.path);
  }

  await loginViaDemoSoftwareCompany(page);
  await dismissBlockingOverlays(page);

  for (const r of brochureAuthenticatedRoutes) {
    if (!isRequested(r.id)) continue;
    if (!(process.env.CAPTURE_RESUME === "1" && pairExists(r.id))) {
      await prepareRoute(r.path, true);
      await capturePair(r.id);
    } else {
      for (const theme of THEMES) assertPngNotBlank(imagePath(r.id, theme));
    }
    register(r.id, r.title, r.section, r.path);
  }

  const pr = isRequested("proposal_detail") ? await page.request.get("/api/proposals") : null;
  if (pr) expect(pr.ok()).toBeTruthy();
  const proposals = pr ? ((await pr.json()) as Array<{ id?: string }>) : [];
  const proposalId = proposals[0]?.id;
  if (proposalId) {
    if (!(process.env.CAPTURE_RESUME === "1" && pairExists("proposal_detail"))) {
      await prepareRoute(`/proposals/${proposalId}`, true);
      await capturePair("proposal_detail");
    }
    register("proposal_detail", "Proposal detail", "sales", "/proposals/:id");
  }

  const po = isRequested("payroll_run_detail") ? await page.request.get("/api/payroll/overview") : null;
  if (po?.ok()) {
    const overview = (await po.json()) as {
      periods?: Array<{ latestRun?: { id?: string } | null }>;
    };
    const runId = overview.periods?.find((x) => x.latestRun?.id)?.latestRun?.id;
    if (runId) {
      if (!(process.env.CAPTURE_RESUME === "1" && pairExists("payroll_run_detail"))) {
        await prepareRoute(`/payroll/runs/${runId}`, true);
        await capturePair("payroll_run_detail");
      }
      register("payroll_run_detail", "Payroll run detail", "workspace", "/payroll/runs/:id");
    }
  }

  const shopRes = isRequested("public_shop") ? await page.request.get("/api/shop/settings") : null;
  if (shopRes?.ok()) {
    const shopData = (await shopRes.json()) as { shopSlug?: string | null };
    const slug = shopData.shopSlug?.trim();
    if (slug) {
      if (!(process.env.CAPTURE_RESUME === "1" && pairExists("public_shop"))) {
        await prepareRoute(`/shop/${slug}`, false);
        await capturePair("public_shop");
      }
      register("public_shop", "Public storefront", "public_shop", "/shop/:slug");
    }
  }

  await context.close();

  const generatedAt = new Date().toISOString();
  fs.writeFileSync(PRODUCT_MANIFEST, JSON.stringify({ generatedAt, viewport: { width: 1440, height: 900 }, shots: manifest }, null, 2));
  fs.writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        generatedAt,
        shots: Object.fromEntries(
          Object.entries(manifest).map(([id, shot]) => [id, { relPath: `assets/screenshots/${id}.png`, title: shot.title, section: shot.section }]),
        ),
      },
      null,
      2,
    ),
  );
});
