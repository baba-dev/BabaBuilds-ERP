# BabaBuilds ERP — sales brochure pack

Distribution-ready **HTML + PDF** product overview with on-brand styling ([`brochure.css`](brochure.css)) and validated screenshots from the **Software Company** demo template.

## Outputs

| Artifact | Path |
|----------|------|
| Standalone HTML (with API appendix stitched) | [`index.dist.html`](index.dist.html) |
| Source HTML (marker for appendix) | [`index.html`](index.html) |
| API appendix fragment | [`api-appendix.html`](api-appendix.html) |
| Screenshots (PNG) | [`assets/screenshots/`](assets/screenshots/) |
| Capture manifest | [`brochure-manifest.json`](brochure-manifest.json) |
| Sales PDF (screenshots + narrative) | [`dist/bababuilds-erp-brochure.pdf`](dist/bababuilds-erp-brochure.pdf) |
| Full PDF with API appendix | `BROCHURE_PDF_HTML=dist npm run brochure:pdf` |

## One-shot build

Requires Node 26.13.1 and npm 11.20.0, `.env` with `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and Playwright Chromium (`npx playwright install chromium`).

```bash
npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run brochure:dist
```

This runs: shell HTML generation → grouped API appendix → stitch → Playwright capture (starts dev server per `playwright.config.ts`) → PDF export.

## Individual steps

- `npm run brochure:shell` — regenerate `index.html` from [`brochure-routes.ts`](brochure-routes.ts) and [`scripts/generate-brochure-shell.ts`](../scripts/generate-brochure-shell.ts).
- `npm run brochure:api-appendix` — scan `app/api/**/route.ts` into `api-appendix.html`.
- `npm run brochure:stitch` — inject appendix into `index.dist.html`.
- `npm run brochure:capture` — demo login (`software_company` template) and write PNGs + manifest (rejects blank images).
- `npm run brochure:pdf` — Chromium print to `dist/bababuilds-erp-brochure.pdf` (uses `index.html`; set `BROCHURE_PDF_HTML=dist` to include the API appendix).

## Demo data notes

Screenshots use **synthetic** companies and balances. The Software Company demo seeds shop catalog, inventory products, payroll, documents, tax advanced signals, and a **unique** public shop slug per workspace to satisfy `shopSlug` uniqueness.
