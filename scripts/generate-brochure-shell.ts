/**
 * Generates docs/sales-brochure/index.html shell (figures + copy scaffolding).
 * Run: npx tsx scripts/generate-brochure-shell.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  brochureAuthenticatedRoutes,
  brochurePublicRoutes,
  type BrochureSection,
} from "../docs/sales-brochure/brochure-routes";

const ROOT = path.join(process.cwd(), "docs", "sales-brochure");
const OUT = path.join(ROOT, "index.html");

const EXTRA_SHOTS: { id: string; title: string; section: BrochureSection }[] = [
  { id: "proposal_detail", title: "Proposal detail", section: "sales" },
  { id: "payroll_run_detail", title: "Payroll run detail", section: "workspace" },
  { id: "public_shop", title: "Public storefront", section: "public_shop" },
];

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function figuresHtml(shots: { id: string; title: string }[]) {
  const body = shots
    .map(
      (r) =>
        `  <figure>\n    <img src="assets/screenshots/${esc(r.id)}.png" alt="${esc(r.title)}" width="1440" height="900" loading="lazy" />\n    <figcaption>${esc(r.title)}</figcaption>\n  </figure>`,
    )
    .join("\n");
  return `<div class="grid">\n${body}\n</div>\n`;
}

function allShots(): { id: string; title: string; section: BrochureSection }[] {
  const map = new Map<string, { id: string; title: string; section: BrochureSection }>();
  for (const r of brochurePublicRoutes) map.set(r.id, r);
  for (const r of brochureAuthenticatedRoutes) map.set(r.id, r);
  for (const r of EXTRA_SHOTS) map.set(r.id, r);
  return [...map.values()];
}

function sectionBlock(title: string, section: BrochureSection, intro: string) {
  const shots = allShots().filter((s) => s.section === section);
  if (shots.length === 0) return "";
  return (
    `<section id="sec-${section}">\n` +
    `<h2>${esc(title)}</h2>\n` +
    `<p class="muted">${esc(intro)}</p>\n` +
    figuresHtml(shots) +
    `</section>\n`
  );
}

const html =
  `<!DOCTYPE html>\n` +
  `<html lang="en">\n<head>\n` +
  `  <meta charset="utf-8" />\n` +
  `  <meta name="viewport" content="width=device-width, initial-scale=1" />\n` +
  `  <title>BabaBuilds ERP — Product overview</title>\n` +
  `  <link rel="stylesheet" href="brochure.css" />\n` +
  `</head>\n<body>\n` +
  `  <header class="cover">\n` +
  `    <div class="brand-mark">\n` +
  `      <div class="brand-icon">B</div>\n` +
  `      <span style="font-size:1.85rem;font-weight:900;letter-spacing:-0.02em;">BabaBuilds</span>\n` +
  `    </div>\n` +
  `    <p class="tagline-pill">Operations · Finance · Compliance</p>\n` +
  `    <h1>BabaBuilds ERP</h1>\n` +
  `    <p class="subtitle">A full-stack workspace for proposals, billing, tax, cash visibility, documents, workforce, payroll, and optional storefront — designed for clarity and controlled rollout.</p>\n` +
  `  </header>\n\n` +
  `  <main style="max-width:900px;margin:0 auto;padding:0 1.25rem 2rem;">\n` +
  `    <div class="disclaimer">\n` +
  `      <strong>Demo imagery.</strong> Screenshots in this pack are captured from seeded demo workspaces with synthetic companies, amounts, and names. Live integrations (bank feeds, payments, email, AI, CAPTCHA) depend on your environment and plan.\n` +
  `    </div>\n\n` +
  sectionBlock("Go to market", "marketing", "Public entry points and educational surfaces.") +
  sectionBlock("Workspace overview", "overview", "Dashboard, settings, and in-product guidance.") +
  sectionBlock("Operations & delivery", "operations", "Clients, services, inventory, documents, imports, and the operator view of Shop.") +
  sectionBlock("Sales & revenue", "sales", "Proposals, pipeline intelligence, retainers, and invoicing.") +
  sectionBlock("Finance & intelligence", "finance", "Expenses, cash flow, reporting, AR collections, tax, and AI-assisted reconciliation.") +
  sectionBlock("Compliance & advisors", "compliance", "Chartered accountant portal and regulated export patterns.") +
  sectionBlock("People & payroll", "workspace", "Workforce, attendance, leave, and payroll runs.") +
  sectionBlock("Public storefront", "public_shop", "Buyer-facing catalog experience at your branded slug.") +
  `    <section id="modules">\n` +
  `      <h2>Optional modules (workspace toggles)</h2>\n` +
  `      <p class="muted">Advanced capabilities are non-destructive toggles in Settings. When disabled, data is preserved and navigation hides the module.</p>\n` +
  `      <ul>\n` +
  `        <li><strong>Workforce</strong> — directory, attendance, leave, and HR workflows.</li>\n` +
  `        <li><strong>Payroll</strong> — runs, readiness, posting safeguards, and exports.</li>\n` +
  `        <li><strong>Revenue pipeline</strong> — proposal stages, stalled deals, and next actions.</li>\n` +
  `        <li><strong>Document vault</strong> — intake, OCR review, and ERP linking.</li>\n` +
  `        <li><strong>Cash flow</strong> — snapshots, scenarios, variance, and alerts.</li>\n` +
  `        <li><strong>AR collections</strong> — aging, queues, and follow-up discipline.</li>\n` +
  `        <li><strong>Tax advanced</strong> — readiness, diagnostics, and audit-friendly workflows.</li>\n` +
  `        <li><strong>Reporting center</strong> — governed presets and exports.</li>\n` +
  `        <li><strong>Import manager</strong> — template-driven CSV/XLSX migration with preview-first execution.</li>\n` +
  `        <li><strong>Public shop</strong> — storefront, orders, and gateway-aware checkout when configured.</li>\n` +
  `      </ul>\n` +
  `    </section>\n\n` +
  `    <section id="integrations">\n` +
  `      <h2>Integrations (environment-dependent)</h2>\n` +
  `      <ul>\n` +
  `        <li>NextAuth with Google, email magic links, and secure demo credentials.</li>\n` +
  `        <li>Razorpay and Stripe for subscriptions and shop checkout.</li>\n` +
  `        <li>Plaid for bank linking in reconciliation flows.</li>\n` +
  `        <li>SMTP for outbound mail and collections reminders.</li>\n` +
  `        <li>Optional AI features where keys and policies allow.</li>\n` +
  `      </ul>\n` +
  `    </section>\n\n` +
  `    <!-- API_APPENDIX -->\n\n` +
  `    <div class="back-cover">\n` +
  `      <h2 style="border:none;">BabaBuilds ERP</h2>\n` +
  `      <p class="muted">Single workspace for finance operations, compliance evidence, and growth workflows.</p>\n` +
  `    </div>\n` +
  `  </main>\n</body>\n</html>\n`;

fs.writeFileSync(OUT, html, "utf8");
console.log("Wrote", path.relative(process.cwd(), OUT));
