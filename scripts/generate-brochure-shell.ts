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
        `  <figure>\n    <img src="assets/screenshots/${esc(r.id)}.png" alt="${esc(r.title)}" width="1440" height="900" loading="eager" decoding="async" />\n    <figcaption>${esc(r.title)}</figcaption>\n  </figure>`,
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

function salesNarrativeHtml() {
  return (
    `<section id="executive-summary" class="sales-block">\n` +
    `  <h2>Executive summary</h2>\n` +
    `  <p>BabaBuilds ERP is a conversion-first financial operations workspace for agencies, accountants, contractors, freelancers, and service businesses. It unifies proposals, invoicing, expenses, tax readiness, cash visibility, document evidence, workforce, payroll, and an optional public storefront — with module toggles so teams adopt capabilities at their own pace.</p>\n` +
    `  <div class="highlights">\n` +
    `    <div class="highlight-card"><strong>Revenue to cash</strong><span>Pipeline, proposals, retainers, invoices, and AR collections in one flow.</span></div>\n` +
    `    <div class="highlight-card"><strong>Compliance-ready</strong><span>GST/VAT workflows, CA portal exports, and audit-friendly document vault.</span></div>\n` +
    `    <div class="highlight-card"><strong>Controlled rollout</strong><span>Optional modules preserve data when disabled; navigation adapts to your plan.</span></div>\n` +
    `  </div>\n` +
    `</section>\n\n` +
    `<section id="who-its-for" class="sales-block">\n` +
    `  <h2>Who it is for</h2>\n` +
    `  <p class="muted">Persona landing pages and interactive demos mirror how different buyers evaluate the product.</p>\n` +
    `  <table class="data-table">\n` +
    `    <thead><tr><th>Persona</th><th>Primary outcomes</th></tr></thead>\n` +
    `    <tbody>\n` +
    `      <tr><td><strong>Agencies &amp; studios</strong></td><td>Proposals, retainers, multi-client billing, pipeline visibility, team seats.</td></tr>\n` +
    `      <tr><td><strong>Freelancers &amp; consultants</strong></td><td>Fast invoicing, expenses, tax estimates, lightweight compliance.</td></tr>\n` +
    `      <tr><td><strong>Contractors &amp; builders</strong></td><td>Inventory, purchase orders, job costing signals, document vault.</td></tr>\n` +
    `      <tr><td><strong>Small businesses</strong></td><td>Core books, cash flow, reporting presets, optional shop.</td></tr>\n` +
    `      <tr><td><strong>Chartered accountants</strong></td><td>CA portal, regulated exports, client workspace handoff.</td></tr>\n` +
    `    </tbody>\n` +
    `  </table>\n` +
    `</section>\n\n` +
    `<section id="platform-at-a-glance" class="sales-block">\n` +
    `  <h2>Platform at a glance</h2>\n` +
    `  <table class="data-table compact">\n` +
    `    <thead><tr><th>Area</th><th>Capabilities</th></tr></thead>\n` +
    `    <tbody>\n` +
    `      <tr><td>Sales</td><td>Proposals, revenue pipeline, retainers, invoice workspace</td></tr>\n` +
    `      <tr><td>Finance</td><td>Expenses, cash flow scenarios, reporting, AR aging, tax hub, AI reconciliation</td></tr>\n` +
    `      <tr><td>Operations</td><td>Clients, services, inventory, POs, imports, document vault</td></tr>\n` +
    `      <tr><td>People</td><td>Workforce directory, attendance, leave, payroll runs</td></tr>\n` +
    `      <tr><td>Growth</td><td>Public shop, partner hub, referrals</td></tr>\n` +
    `    </tbody>\n` +
    `  </table>\n` +
    `</section>\n\n` +
    `<section id="pricing" class="sales-block">\n` +
    `  <h2>Plans &amp; pricing</h2>\n` +
    `  <p class="muted">Regional catalogs on the marketing site; representative monthly prices below. Annual billing is 10× monthly (two months free vs paying monthly for a year). New workspaces can start a <strong>15-day Pro trial</strong>.</p>\n` +
    `  <table class="data-table">\n` +
    `    <thead><tr><th>Plan</th><th>India (INR/mo)</th><th>US / ROW (USD/mo)</th><th>Highlights</th></tr></thead>\n` +
    `    <tbody>\n` +
    `      <tr><td><strong>Free</strong></td><td>₹0</td><td>$0</td><td>Core product with limits on clients, invoices, and shop listings</td></tr>\n` +
    `      <tr><td><strong>Pro</strong></td><td>₹1,499</td><td>$5</td><td>Payment gateways, higher limits, document storage</td></tr>\n` +
    `      <tr><td><strong>Team</strong></td><td>₹3,499</td><td>$15</td><td>Multi-seat collaboration, Team billing interval</td></tr>\n` +
    `    </tbody>\n` +
    `  </table>\n` +
    `  <p class="muted" style="margin-top:0.75rem;">EU (EUR) and Oman (OMR) price lists follow the same structure on <code>erp.bababuilds.com</code>. Payment gateways: Razorpay (INR) and Stripe (international) when configured.</p>\n` +
    `</section>\n\n` +
    `<section id="trust" class="sales-block">\n` +
    `  <h2>Security &amp; trust</h2>\n` +
    `  <ul>\n` +
    `    <li><strong>Authentication</strong> — NextAuth with Google, email magic links, MFA for high-risk roles, and audited demo credentials.</li>\n` +
    `    <li><strong>Workspace isolation</strong> — Multi-tenant data scoped per workspace with role-based permissions.</li>\n` +
    `    <li><strong>Evidence &amp; exports</strong> — CA portal CSV/ZIP exports, governed reporting presets, document vault with OCR review.</li>\n` +
    `    <li><strong>Operational hygiene</strong> — Scheduled cron jobs for integrity, trial expiry, tax obligations, and payment sync (production).</li>\n` +
    `  </ul>\n` +
    `</section>\n\n` +
    `<section id="getting-started" class="sales-block">\n` +
    `  <h2>Getting started</h2>\n` +
    `  <ol class="steps">\n` +
    `    <li>Visit <strong>erp.bababuilds.com</strong> and choose your persona or start a Pro trial.</li>\n` +
    `    <li>Explore an interactive demo with seeded data — no credit card required for trial evaluation.</li>\n` +
    `    <li>Enable optional modules in Settings as your team is ready; imports use preview-first CSV/XLSX templates.</li>\n` +
    `    <li>Connect Razorpay, Stripe, SMTP, Plaid, or AI when your environment and plan allow.</li>\n` +
    `  </ol>\n` +
    `</section>\n\n` +
    `<section id="product-tour" class="sales-block page-break-before">\n` +
    `  <h2>Product tour (in-app screenshots)</h2>\n` +
    `  <p class="muted">The following pages are captured from the Software Company demo template with synthetic data.</p>\n` +
    `</section>\n`
  );
}

const html =
  `<!DOCTYPE html>\n` +
  `<html lang="en">\n<head>\n` +
  `  <meta charset="utf-8" />\n` +
  `  <meta name="viewport" content="width=device-width, initial-scale=1" />\n` +
  `  <title>BabaBuilds ERP — Sales brochure</title>\n` +
  `  <link rel="stylesheet" href="brochure.css" />\n` +
  `</head>\n<body>\n` +
  `  <header class="cover">\n` +
  `    <div class="brand-mark">\n` +
  `      <div class="brand-icon">B</div>\n` +
  `      <span style="font-size:1.85rem;font-weight:900;letter-spacing:-0.02em;">BabaBuilds</span>\n` +
  `    </div>\n` +
  `    <p class="tagline-pill">Operations · Finance · Compliance</p>\n` +
  `    <h1>BabaBuilds ERP</h1>\n` +
  `    <p class="subtitle">Sales brochure — product overview with in-app screenshots, module map, pricing, and integration surface.</p>\n` +
  `    <p class="cover-meta muted">erp.bababuilds.com · 15-day Pro trial · Interactive persona demos</p>\n` +
  `  </header>\n\n` +
  `  <main style="max-width:900px;margin:0 auto;padding:0 1.25rem 2rem;">\n` +
  `    <div class="disclaimer">\n` +
  `      <strong>Demo imagery.</strong> Screenshots in this pack are captured from seeded demo workspaces with synthetic companies, amounts, and names. Live integrations (bank feeds, payments, email, AI, CAPTCHA) depend on your environment and plan.\n` +
  `    </div>\n\n` +
  salesNarrativeHtml() +
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
  `      <p class="cta-line"><strong>Start a 15-day Pro trial</strong> at erp.bababuilds.com/signup?plan=pro&amp;trial=15</p>\n` +
  `      <p class="muted">Questions? hello@bababuilds.com · LinkedIn /company/bababuilds</p>\n` +
  `    </div>\n` +
  `  </main>\n</body>\n</html>\n`;

fs.writeFileSync(OUT, html, "utf8");
console.log("Wrote", path.relative(process.cwd(), OUT));
