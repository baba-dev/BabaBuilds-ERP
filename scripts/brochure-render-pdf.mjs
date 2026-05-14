#!/usr/bin/env node
/**
 * Renders docs/sales-brochure/index.html to PDF using Playwright Chromium.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "docs", "sales-brochure");
const HTML = fs.existsSync(path.join(ROOT, "index.dist.html"))
  ? path.join(ROOT, "index.dist.html")
  : path.join(ROOT, "index.html");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "bababuilds-erp-brochure.pdf");

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error("Missing", HTML);
    process.exit(1);
  }
  fs.mkdirSync(DIST, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${HTML}`, { waitUntil: "load" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: OUT,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
  });
  await browser.close();
  console.log("Wrote", path.relative(process.cwd(), OUT));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
