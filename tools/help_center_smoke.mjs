import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const artifactsDir = process.env.ARTIFACTS_DIR ?? "/opt/cursor/artifacts";

function url(path) {
  return `${baseUrl}${path}`;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: { dir: artifactsDir },
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    // Keep the smoke test resilient; log for debugging only.
    // eslint-disable-next-line no-console
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  // /help landing
  await page.goto(url("/help"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${artifactsDir}/help_landing.png`, fullPage: true });

  // search
  await page.getByLabel("Search Help Center articles").fill("invoice");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${artifactsDir}/help_search_dropdown.png`, fullPage: false });
  // Click a deterministic result (avoids picking /help/category/*)
  const resultLink = page.getByRole("link", { name: /Generating & Sending Invoices/i }).first();
  await resultLink.click();

  // article page
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${artifactsDir}/help_article.png`, fullPage: true });

  // toc click (if present)
  const tocLink = page.locator('aside a[href^="#"]').first();
  if (await tocLink.count()) {
    await tocLink.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${artifactsDir}/help_article_after_toc_click.png`, fullPage: false });
  }

  // diagram visible
  const diagram = page.locator('img[src*="/help/diagrams/"], img[alt*="workflow"]').first();
  if (await diagram.count()) {
    await diagram.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${artifactsDir}/help_article_diagram.png`, fullPage: false });
  }

  // category page
  await page.goto(url("/help/category/getting-started"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${artifactsDir}/help_category_getting_started.png`, fullPage: true });

  // canonical help center route
  await page.goto(url("/help"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${artifactsDir}/help_hub.png`, fullPage: true });

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

