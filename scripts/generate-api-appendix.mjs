#!/usr/bin/env node
/**
 * Scans app/api for route.ts files and writes a grouped HTML table for the brochure appendix.
 */
import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.join(process.cwd(), "app", "api");
const OUT = path.join(process.cwd(), "docs", "sales-brochure", "api-appendix.html");

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) files.push(...walk(p));
    else if (name.name === "route.ts" || name.name === "route.tsx") files.push(p);
  }
  return files;
}

function main() {
  const routes = walk(API_ROOT);
  const byTop = new Map();
  for (const file of routes) {
    const rel = path.relative(API_ROOT, file);
    const parts = rel.split(path.sep);
    const top = parts[0] ?? "_root";
    if (!byTop.has(top)) byTop.set(top, []);
    byTop.get(top).push("/api/" + rel.replace(/\\/g, "/").replace(/\/route\.tsx?$/, ""));
  }

  const tops = [...byTop.keys()].sort((a, b) => a.localeCompare(b));
  let html = `<section class="api-appendix" id="api-appendix">\n<h2>HTTP API surface (grouped)</h2>\n<p class="muted">Auto-generated from <code>app/api</code>. Method-level detail lives in route handlers.</p>\n`;

  for (const top of tops) {
    const list = byTop.get(top).sort((a, b) => a.localeCompare(b));
    html += `<h3>${escapeHtml(top)}</h3>\n<table><thead><tr><th>Route</th></tr></thead><tbody>\n`;
    for (const r of list) {
      html += `<tr><td><code>${escapeHtml(r)}</code></td></tr>\n`;
    }
    html += `</tbody></table>\n`;
  }
  html += `</section>\n`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${routes.length} route files)`);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

main();
