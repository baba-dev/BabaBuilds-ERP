import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outputDir = process.env.OUTPUT_DIR ?? path.join(process.cwd(), "public/help/screenshots");
const demoTemplateKey = process.env.DEMO_TEMPLATE_KEY ?? "dm_agency";

const dashboardOrderedPages = [
  { key: "dashboard", path: "/dashboard" },
  { key: "service-catalog", path: "/services" },
  { key: "shop", path: "/shop" },
  { key: "inventory", path: "/inventory" },
  { key: "clients", path: "/clients" },
  { key: "proposals", path: "/proposals" },
  { key: "retainers", path: "/retainers" },
  { key: "referrals", path: "/referrals" },
  { key: "expenses", path: "/expenses" },
  { key: "tax", path: "/tax" },
  { key: "reconciliation", path: "/reconciliation" },
  { key: "income", path: "/income" },
  { key: "ca-portal", path: "/ca-portal" },
  { key: "settings", path: "/settings" },
];

const optionalModulePages = [
  { key: "workforce", path: "/workforce" },
  { key: "payroll", path: "/payroll" },
  { key: "revenue-pipeline", path: "/proposals/pipeline" },
  { key: "document-vault", path: "/documents/vault" },
  { key: "cash-flow", path: "/cash-flow/overview" },
  { key: "ar-collections", path: "/ar-collections" },
  { key: "reporting-center", path: "/reporting" },
  { key: "import-manager", path: "/import-manager" },
];

async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

async function capture(page, fileName, opts = {}) {
  const target = path.join(outputDir, fileName);
  await page.waitForTimeout(opts.delayMs ?? 400);
  await page.screenshot({ path: target, fullPage: opts.fullPage ?? true });
  // eslint-disable-next-line no-console
  console.log(`captured: ${target}`);
}

async function clickDemoLogin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("demo-auth-section").click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 15000 });

  const templateRadio = dialog.getByRole("button", { name: new RegExp(demoTemplateKey.replace("_", " "), "i") });
  if (await templateRadio.count()) {
    await templateRadio.first().click();
  }

  await dialog.getByTestId("demo-auth-button").click();
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 120000 });
}

async function captureModuleSet(page, modules, segment) {
  for (const mod of modules) {
    try {
      await page.goto(`${baseUrl}${mod.path}`, { waitUntil: "domcontentloaded" });
      await capture(page, `${segment}-${mod.key}-01-overview.png`, { fullPage: true });

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
      await capture(page, `${segment}-${mod.key}-02-primary-action.png`, { fullPage: false, delayMs: 350 });

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.7));
      await capture(page, `${segment}-${mod.key}-03-detail.png`, { fullPage: false, delayMs: 350 });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`failed module ${mod.key}:`, error);
    }
  }
}

async function main() {
  await ensureDir(outputDir);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    // eslint-disable-next-line no-console
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  await clickDemoLogin(page);
  await capture(page, "auth-bootstrap-dashboard.png", { fullPage: true });

  await captureModuleSet(page, dashboardOrderedPages, "help");
  await captureModuleSet(page, optionalModulePages, "help-optional");

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await capture(page, "help-settings-modules-enabled.png", { fullPage: true });

  await context.close();
  await browser.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
