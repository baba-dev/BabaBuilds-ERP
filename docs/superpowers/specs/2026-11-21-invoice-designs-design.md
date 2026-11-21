# Invoice designs: six new templates, brand accent, TDS, UPI/QR, design comparison page

Status: draft for approval. Date: 2026-11-21.

## Intent and why

BabaBuilds ERP issues invoices as PDFs drawn with `pdf-lib` through a template registry (`lib/invoice-templates/`). Two designs exist (`DESIGN_1` Classic, `DESIGN_2` Modern). The owner wants six more designs, each built around a real invoicing problem, so a workspace can pick the one that fits its business and gets paid faster. Invoices must be beautiful and functional, and tuned for Indian B2B practice (GST, TDS, UPI).

## Goals

1. Six new templates, `DESIGN_3` to `DESIGN_8`, registered through the existing registry:

| ID | Name | Problem it solves | Paper |
|---|---|---|---|
| DESIGN_3 | Tax Invoice | Rejected for missing GST fields: per-line HSN/SAC and rate, CGST/SGST/IGST split, place of supply, reverse-charge / SEZ notes, IRN + e-invoice QR, tax summary by rate, amount in words | A4 |
| DESIGN_4 | Pay-Fast | Late payment: large amount due, "Scan to pay" panel (Razorpay QR + UPI/static QRs), copyable bank block, due date and late-fee terms | A4 |
| DESIGN_5 | Itemised Project | Disputed vague lines: qty x rate, grouped sections with subtotals, explicit discounts, per-line notes | A4 |
| DESIGN_6 | Statement | Lost track of balances: previous balance, payments received, credit notes applied, amount due now | A4 |
| DESIGN_7 | Minimal Pro | Wants a clean one-pager, whitespace, a single accent | A4 |
| DESIGN_8 | Receipt | Counter sales: narrow format, small UPI QR at the end | 80mm thermal |

2. Brand accent colour: workspace default, with optional per-client and per-invoice overrides.
3. TDS / withholding shown on the invoice, with net payable.
4. Razorpay payment-link QR, Razorpay dynamic (fixed-amount) UPI QR, and UPI / static QRs on invoices.
5. Optional UPI ID and static QR collection in settings and in onboarding.
6. PAID / PARTIAL stamps supported by every new design.
7. A page showing the user's latest invoice in all 8 designs as tiles, with a full-screen view and a "use this design" action.
8. Redis (the existing, flag-gated integration) used wherever it measurably helps, with everything still working when Redis is off.
9. All new UI is top-grade, aesthetic and mobile-first.

## Non-goals and anti-goals

- No headless browser, no HTML-to-PDF, no server-side PDF rasterising (the VPS is ARM and small). Rendering stays `pdf-lib`; thumbnails are drawn client-side.
- No change to the existing Classic and Modern look or the `invoiceTheme` values `DESIGN_1` / `DESIGN_2`. Unknown theme values keep falling back to `DESIGN_1`.
- No Redis dependency for correctness: every cache, lock and limit degrades to in-process or no-op behaviour when Redis is disabled or unhealthy.
- Anti-goal: a QR on the invoice for an amount that is not what the client should pay (see TDS), a pay-now QR on an already paid invoice, or a dead QR on an invoice that is paid late (see dynamic QR).
- Anti-goal: a pale accent that makes a header or table unreadable or unprintable.
- Anti-goal: the designs differing only by colour. Each must have its own layout.

## Constraints

- Production is an ARM VPS. Dependencies must be pure JS and light. The preview page must not render eight PDFs per request without caching and a concurrency cap.
- Runtime: Node version is not a concern for this design (pure JS); the repo pins Node 26.13.1 / npm 11.20.0 for development.
- Every `schema.prisma` change needs a migration (`prisma/migrations/README.md`; `npm run check:migrations`). Applied migrations are never rewritten.
- Run `npm run ci:fast` before pushing. Add no new lint warnings (no `any`, no sync `setState` in effects, no components defined inside components).
- Android conventions in AGENTS.md apply to new UI (`min-h-app`, safe areas, touch visibility). PDFs cannot be shown in iframes reliably in Android WebViews and TWAs.
- Redis is the existing `lib/redis` integration: opt-in via `ERP_REDIS_*` flags, fail-fast (1.5s timeouts), namespaced keys, three purposes (cache, queue, dataCache). New code uses it only through that layer, never opens its own connections, and treats `null` / errors as "not available".
- Paid entitlements fail closed; payment-link and QR features keep the existing guards (INR only, Pro only).
- AGENTS.md notes that Next.js in this repo has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before writing routes or pages.

## Approaches considered

- **A. Template per design on the existing registry, plus a shared layout kit. (Chosen by the owner.)** Each design stays small; the kit holds tables, totals, QR, stamp, tokens. Classic and Modern untouched. Cost: the view model grows.
- B. One configurable template with layout switches. Less code, but the designs would look like variations of one thing. Rejected.
- C. HTML/CSS to PDF. Easier to make pretty, but needs a headless browser; too heavy for the ARM VPS. Rejected.

## Decisions

### Shared kit (`lib/invoice-templates/shared/`)

`tokens.ts` (accent to tints and contrast text), `fonts.ts` (embedded font with rupee glyph), `table.ts` (column layouts, row pagination using `ensureRoom`), `totals.ts` (subtotal, GST split, discount, TDS, net payable), `qr.ts` and `qr-panel.ts`, `stamp.ts`, `words.ts` (amount in words, lakh/crore), `party-blocks.ts`.

### Dependencies (all pure JS, owner approved)

- `qrcode`: QR matrix generation. Modules are drawn as vector squares, so no image encoding.
- `@pdf-lib/fontkit` plus a bundled subsettable font (Noto Sans or Inter, regular and bold). Built-in Helvetica cannot print the rupee sign; today's PDFs print "INR 1,000". Font bytes are read once and cached in memory; embedding uses subsetting to keep PDFs small. Existing Classic and Modern keep Helvetica unless the builder finds this is a safe, visible improvement; do not change them without approval.
- `pdfjs-dist`: client-side, lazy-loaded, only on the comparison page. Zero server cost.
- `sharp` is already installed and is used to normalise uploaded QR images.

### View model extension (`build-invoice-view-model.ts`)

Add, without breaking existing fields: `lines[]` (description, quantity, unit price, discount, tax rate, SAC/HSN, amount, optional note, optional section), a GST split (CGST/SGST/IGST, place of supply, reverse charge, SEZ, IRN), a TDS block, `accentColor`, `paymentQrs`, `paymentStatus` (kind, paid on, amount paid, balance due), and for the Statement design: previous balance, payments, credit notes. Classic and Modern continue reading the existing fields.

### Brand accent colour

- Resolution order, first match wins: **invoice override, client override, workspace default, the design's own default**.
- Storage: nullable `invoiceAccentColor` on the business profile (workspace default), on `Client`, and on `Invoice`. The invoice override is stored on the invoice so a regenerated or re-sent PDF always matches the original.
- UI: workspace default in Settings, Invoicing, beside the design picker. Client override on the client's edit form ("Invoice colour for this client", with a clear-to-inherit action). Invoice override in the composer, a compact swatch control that shows which level the current colour is inherited from.
- `tokens.ts` derives tints and a readable text colour from the hex by luminance. The picker rejects colours that fail a minimum contrast against white and suggests the nearest accessible shade. Every design stays legible in black and white.
- The comparison page's accent control sets the workspace default only, and says so.

### TDS / withholding

- Default on the Client: `tdsSection` and `tdsRatePercent` (mirrors `Vendor`). Per-invoice toggle in the invoice composer, prefilled from the client default.
- Calculation base is the amount **before GST** when GST is shown separately.
- Totals block: Subtotal, GST, Invoice total, less TDS @ x% (section), **Net payable**.
- Supplier PAN is printed prominently on the invoice (without it, the payer must deduct at a higher rate).
- **When TDS applies, the Razorpay payment link and every QR on the invoice use the net payable amount.** The link is created at generation time, so generation must compute net payable first.
- Existing `Invoice.withholdingRatePercent`, `withholdingAmount` and `withholdingDeductedAt` record actual deductions. The builder decides, after reading how they are used, whether "expected TDS" can reuse them while `withholdingDeductedAt` is null, or needs separate fields. Whichever is chosen must not corrupt the existing TDS reporting.

### Razorpay QR

Rendered at PDF time from the invoice's existing payment link (`vm.paymentLink`, the Razorpay short URL). It is a pure function of a URL string. No link available (not INR, not Pro, gateway not configured): the panel falls back to bank details; never a broken or empty QR. Shown in the Pay-Fast "Scan to pay" panel. A paid invoice never shows a pay-now QR (see stamps).

### Razorpay dynamic QR (fixed-amount UPI QR)

- New `lib/razorpay-qr.ts`, mirroring the safety contract of `lib/razorpay-links.ts`: never throws, 8s timeout, INR and Pro only, uses the tenant's own keys, returns `null` on any failure, and the invoice still generates without it.
- Uses the Razorpay SDK's `qrCode.create`: type `upi_qr`, fixed amount = net payable (in paise), single use, notes carrying the invoice id, and the GST `tax_invoice` block (invoice number, date, customer name, business GSTIN, GST amount, supply type) so the payment stays on the GST-compliant UPI flow. The builder verifies the exact fields against the installed SDK types and current Razorpay docs.
- The PDF draws the QR itself, as vector modules from the UPI string the API returns (`image_content`), so no image is fetched at render time. The QR id and its expiry are stored on the invoice.
- **Expiry problem:** a dynamic QR closes at its `close_by`, and invoices are very often paid late. So `close_by` is set as far out as Razorpay allows (builder confirms the limit), the PDF prints "valid until DD MMM", and the payment-link QR / link stays on the invoice as the fallback that never expires with the QR. The public invoice page (`/invoices/public/[token]`) shows a live QR and regenerates an expired one on demand.
- **Partial payments:** the QR amount is the balance due when it is created. Recording a partial payment closes the old QR; a new one is created lazily the next time one is needed.
- **Webhook:** the existing `/api/webhooks/razorpay` handler gains QR events (the builder confirms which events fire for QR payments and how to link them to the invoice via notes). It must verify the signature as it does today, be idempotent, and go through the same payment-recording logic as other payments. This is money-touching code and gets its own stage, tests and review.
- Failure modes tested: QR creation fails, QR closed or expired, duplicate webhook delivery, payment on a QR for a voided invoice.
- Entitlement and setup: needs QR Codes enabled on the tenant's Razorpay account; when it is not, creation fails quietly and the panel uses the payment-link QR and UPI QRs.

### UPI and static QRs

- Fields: `upiVpa` (and optional payee name) on the business profile; up to 3 uploaded static QR images in a small new table (`PaymentQrImage`: workspace, label, private file path, sort order). Images are stored privately like signatures (workspace-namespaced, served by an authenticated route) and normalised with `sharp` (type and size checks, re-encoded PNG).
- A UPI ID generates a standard `upi://pay` QR with payee, amount (net payable), and the invoice number as the note. This is recommended; works in every UPI app and the amount is included.
- Uploaded static QRs (Paytm, GPay and similar) do not carry an amount: the design prints "Enter amount X, reference INV-123" beneath them, and they cannot be reconciled automatically.
- Pay-Fast shows, in priority order, the Razorpay dynamic QR (or the payment-link QR when there is none) plus up to 3 UPI/static QRs, via one shared `QrPanel`. Receipt (DESIGN_8) shows a single small QR at the end of the receipt (UPI QR if a UPI ID is set, otherwise the first uploaded QR; none if neither).

### Where these are collected (optional everywhere)

- **Settings, Banking section:** a new "UPI & QR" card with the UPI ID field and the QR image slots. UPI belongs with the bank details it settles to, not with gateway keys.
- **Onboarding:** an optional "UPI & QR" block in the setup wizard on the step that already collects bank details (builder confirms which step). It can be skipped, and the wizard never blocks on it. The sidebar onboarding checklist may offer it as an optional item; the builder decides based on the existing checklist structure.
- Validation: UPI ID format check (`name@handle`); uploads limited by type and size.

### PAID / PARTIAL stamps

- Every new design supports them through one shared `stamp.ts`, driven by `vm.paymentStatus` (the existing `vm.watermarkKind` is kept as input).
- PAID: a bordered, rotated stamp drawn on page 1 near the totals, plus the existing faint watermark on every page; shows paid date when known. PARTIAL: same style with "PARTIALLY PAID" and the balance due.
- The stamp must not cover the amounts, the QR or key text. On a paid invoice the QR panel is replaced by "Paid in full, thank you".
- Thermal receipt uses a compact inline "PAID" line instead of a diagonal stamp.
- The stamp must also survive black-and-white printing.
- Known gap, outside the six new designs: only Classic currently draws the watermark (Modern does not appear to). Adding the shared stamp to Modern is a small follow-up; not in scope unless the owner asks.

### Settings picker

`lib/settings/schemas.ts` (currently `z.enum(["DESIGN_1","DESIGN_2"])`) and `Invoicing.tsx` (hardcoded two buttons) are driven by the registry so new designs appear automatically.

### Comparison page

- Route `/settings/invoice-designs`, linked from the Invoicing section ("Compare all designs").
- Data: the user's most recent non-void invoice. With no invoices, a labelled sample fixture.
- A preview endpoint renders any design for any of the workspace's invoices. No side effects: it never creates a payment link, never writes files, and reuses the stored link. Workspace-scoped and authenticated. Results are cached through Redis (see the Redis section) and concurrent renders are deduplicated and capped, so eight tiles do not stampede the VPS.
- Grid of 8 tiles, each showing page 1 drawn by `pdfjs-dist` onto a canvas, lazily as the tile scrolls into view. Click a tile for a large view with zoom, a "Use this design" button (writes `invoiceTheme` through the existing settings API), and "Download sample PDF".
- Accent picker and TDS on/off toggle on the page re-render the tiles (debounced).
- Follows the Android/mobile conventions in AGENTS.md.

### Redis (existing integration, used where it earns its keep)

All of it is optional, namespaced under the existing `erp:*` prefix, and falls back safely when Redis is off.

- **Preview render cache:** rendered preview PDF bytes in the `dataCache` purpose, key = workspace, invoice id and updated-at, design, accent, TDS flag, a template version. Short TTL (minutes), small entries (tens of KB). Workspace data-cache invalidation (`invalidateWorkspaceDataCache`) is called when the invoice, client, profile, accent or QR settings change. This needs a new data-cache kind alongside `dashboard` and `report`. With Redis off, a small in-process LRU is used.
- **Single-flight render lock:** `SET NX` with a short expiry so eight tiles, several tabs and multiple PM2 workers render a given preview once; the others wait for the cached result.
- **Rate limiting:** the preview endpoint and the QR upload endpoint go through the existing `enforceRouteRateLimit` (already Redis-backed with a fallback).
- **Idempotent QR creation:** a short lock keyed by invoice, so a double click or retry does not create two Razorpay QR codes (alongside the existing idempotency table).
- **Jobs (only if `ERP_REDIS_JOBS_ENABLED`):** a BullMQ job to close expired or superseded Razorpay QR codes. Without the jobs flag the lazy path described above is used.
- **Not Redis:** the font bytes (local file, cached in process memory), and issued invoice PDFs (already stored by `lib/invoice/pdf-storage.ts`).
- ARM VPS budget: previews are small, TTLs short, tiles render lazily, and the render cap bounds concurrent CPU work.

### UI quality bar (applies to every new screen)

- Surfaces: Settings Invoicing (picker + accent), Settings Banking (UPI & QR card), setup wizard UPI & QR block, client form colour field, composer accent and TDS controls, and the comparison page.
- Design: built with the `frontend-design` skill, using the repo's tokens and typography roles (`pageTitle`, `sectionHeader`, `cardTitle`, `bodyCopy`, `cardBody`) and the PR template's style gates (visible focus rings, contrast, distinct hover/active, disabled / error / warning / success / loading / empty states, `/admin/style-gallery` parity if component visuals change). Light and dark themes, reduced-motion respected, all copy translated (en-IN, hi, es, ar).
- Mobile first: tiles reflow from one to several columns; tiles use the true paper aspect (A4 portrait, tall narrow for the receipt); skeleton shimmer while rendering; full-screen view supports pinch-zoom and swipe between designs; controls move into a bottom sheet on phones with a sticky action bar above the bottom nav (`bottom-above-nav`, `pb-safe`, `pointer-coarse:` sizing, no `min-h-screen` inside the shell); the full-screen route is added to `FOCUS_ROUTE_PATTERNS` if it hides the tab bar.
- Delight without noise: a live preview that updates as the accent changes, an inheritance hint on the accent control ("from client"), friendly empty states (no invoices yet: sample shown and labelled), QR upload with an in-place preview and crop-safe validation.
- The PDFs are held to the same bar: each rendered design is converted to images (`pdftoppm` is available) and reviewed by eye at A4 and thermal sizes before a stage is called done. UI is verified in a browser at phone width.

### Migration

One migration per stage as needed: `invoiceAccentColor` on the business profile, `Client` and `Invoice`; `upiVpa` (+ optional payee name); `Client.tdsSection`/`tdsRatePercent`; `PaymentQrImage`; any expected-TDS fields the builder decides on; and the Razorpay dynamic QR fields on the invoice (QR id, UPI string, expiry, status).

## Staging

1. Shared kit, fonts, view-model extension, stamp, accent resolution (workspace, client, invoice), migration, settings plumbing. Tax Invoice (DESIGN_3), Pay-Fast (DESIGN_4), Itemised (DESIGN_5).
2. Statement (DESIGN_6), Minimal Pro (DESIGN_7), Receipt (DESIGN_8). TDS on the invoice and in the composer.
3. UPI ID / static QR settings and onboarding, comparison page with the Redis preview cache and render lock, picker driven by the registry.
4. Razorpay dynamic QR, its webhook handling, expiry and partial-payment behaviour. Separate stage because it touches payments.

Each stage ships with tests, sample PDFs checked by eye, and (for UI) a phone-width browser check.

## Testing

Render each design against the fixtures: many-page invoice, export invoice, TDS invoice, no-payment-link invoice, PAID, PARTIAL, long descriptions and long names, no logo, no signature. Assert key text appears and page counts are sane. Unit tests for accent contrast, TDS base calculation, UPI URI building, amount in words, QR matrix drawing. Route tests for the preview endpoint (auth, workspace scoping, rate limit). Accent resolution order. Redis on and off paths for the preview cache and render lock (mock the Redis layer; behaviour identical when disabled). Dynamic QR: creation failure, expiry, duplicate webhook, voided invoice, partial payment, signature verification. Mobile layout checks under `tests/mobile` conventions, and Playwright screenshots at phone width. Existing Classic and Modern outputs must not change. Mocks of shared modules spread `importOriginal()`.

## Left to the builder

Exact layouts, fonts and type scale, default accent per design, expected-TDS storage, which wizard step hosts the UPI block, tile and cache sizing, file and column names, copy and translations (messages exist for en-IN, hi, es, ar; keep locale parity, `npm run check` for locales is part of `ci:fast`).
