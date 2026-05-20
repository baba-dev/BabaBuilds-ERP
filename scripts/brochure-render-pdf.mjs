#!/usr/bin/env node
/**
 * Renders docs/sales-brochure/index.html to PDF using Playwright Chromium.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
const ROOT = path.join(process.cwd(), "docs", "sales-brochure");
const HTML =
  process.env.BROCHURE_PDF_HTML === "dist" && fs.existsSync(path.join(ROOT, "index.dist.html"))
    ? path.join(ROOT, "index.dist.html")
    : path.join(ROOT, "index.html");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "bababuilds-erp-brochure.pdf");

function contentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const rel = urlPath === "/" ? "/index.html" : urlPath;
      const filePath = path.normalize(path.join(rootDir, rel));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function main() {
  if (!fs.existsSync(HTML)) {
    console.error("Missing", HTML);
    process.exit(1);
  }
  fs.mkdirSync(DIST, { recursive: true });
  const htmlName = path.basename(HTML);
  const { server, port } = await startStaticServer(ROOT);
  const url = `http://127.0.0.1:${port}/${htmlName}`;
  console.log("Serving", path.relative(process.cwd(), ROOT), "at", url);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    const imgStats = await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((r) => {
            img.onload = r;
            img.onerror = r;
          });
        }),
      );
      const total = document.images.length;
      const loaded = [...document.images].filter((i) => i.naturalWidth > 0).length;
      return { total, loaded };
    });
    console.log(`Screenshots loaded: ${imgStats.loaded}/${imgStats.total}`);
    await page.emulateMedia({ media: "print" });
    console.log("Generating PDF…");
    await page.pdf({
      path: OUT,
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
      timeout: 600_000,
    });
  } finally {
    await browser.close();
    server.close();
  }
  const stat = fs.statSync(OUT);
  console.log("Wrote", path.relative(process.cwd(), OUT), `(${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
