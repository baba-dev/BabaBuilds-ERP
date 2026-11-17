import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.join(process.cwd(), "docs", "sales-brochure", "premium");
const dist = path.join(root, "dist");
const pdfPath = path.join(dist, "bababuilds-erp-command-after-dark.pdf");
const previewPath = path.join(dist, "cover-preview.png");

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start brochure server");
fs.mkdirSync(dist, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1120, height: 1584 }, deviceScaleFactor: 1 });
try {
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
  });
  const pages = page.locator(".page");
  const count = await pages.count();
  if (count !== 10) throw new Error(`Expected 10 brochure pages, found ${count}`);
  const broken = await page.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth === 0).map((image) => image.getAttribute("src")));
  if (broken.length) throw new Error(`Broken brochure images: ${broken.join(", ")}`);
  await pages.first().screenshot({ path: previewPath });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, timeout: 600_000 });
  console.log(`Rendered ${count} pages to ${path.relative(process.cwd(), pdfPath)}`);
} finally {
  await browser.close();
  server.close();
}
