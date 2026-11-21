# Invoice Designs, Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared invoice layout kit, three new designs (Tax Invoice, Pay-Fast, Itemised Project), the PAID/PARTIAL stamp, and three-level brand accent colour (workspace, client, invoice), selectable from Settings.

**Architecture:** Each design is a self-registering `InvoiceTemplate` on the existing registry (`lib/invoice-templates/`), drawn with `pdf-lib` from an extended, backward-compatible `InvoiceViewModel`. A shared kit in `lib/invoice-templates/shared/` (tokens, fonts, table, totals, party blocks, QR, stamp, words) holds everything designs have in common. Classic (`DESIGN_1`) and Modern (`DESIGN_2`) are not touched.

**Tech Stack:** Next.js (App Router; read `node_modules/next/dist/docs/` before writing routes/pages), TypeScript, Prisma/PostgreSQL 17, `pdf-lib`, new: `@pdf-lib/fontkit`, `qrcode`, `pdfjs-dist` (tests only in this stage), Vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-11-21-invoice-designs-design.md`

## Global Constraints

- Design IDs: Tax Invoice = `DESIGN_3`, Pay-Fast = `DESIGN_4`, Itemised Project = `DESIGN_5`. `DESIGN_1` / `DESIGN_2` output and the `invoiceTheme` string values do not change; unknown theme values still fall back to `DESIGN_1`.
- No headless browser, no HTML-to-PDF, no server-side PDF rasterising. Rendering stays `pdf-lib`. Dependencies must be pure JS and light (ARM VPS).
- Accent resolution order, first match wins: invoice override, client override, workspace default, the design's own default. Accent must be legible and printable in black and white; low-contrast accents are rejected or darkened.
- A paid invoice never shows a pay-now QR (it shows "Paid in full, thank you"). With no payment link the Scan-to-pay panel falls back to bank details; never a broken or empty QR.
- PAID: bordered, rotated stamp on page 1 near the totals, plus the existing faint watermark on every page, with paid date when known. PARTIAL: same style with "PARTIALLY PAID" and the balance due. The stamp must not cover amounts, QR or key text.
- Built-in Helvetica cannot print the rupee sign: new designs embed a bundled font (Noto Sans or Inter, regular + bold, subsettable). Classic and Modern keep Helvetica.
- Every `schema.prisma` change ships with a migration; `npm run check:migrations` must pass. Never rewrite an applied migration. New migration folder names must sort after `20261121120000_email_hosting_accrual_billing`.
- Run `npm run ci:fast` before every push; add no new lint warnings (no `any`, prefix unused with `_`, no sync `setState` in effects, no components defined inside components). Mocks of shared modules spread `importOriginal()`.
- Locale parity: any new `messages/*` key is added to `en-IN`, `hi`, `es`, `ar`.
- UI follows the repo style gates and Android conventions (`min-h-app`, `pb-safe`, `bottom-above-nav`, `pointer-coarse:`), light and dark, reduced motion, visible focus rings. Built with the `frontend-design` skill.
- Production is a Next `standalone` build: any file read at runtime (the font files) must be included in the standalone output.
- Redis is not used in this stage.

## Review Focus

1. A document with zero lines, zero quantity or zero total: renders a labelled empty state, no crash, no divide-by-zero, no QR.
2. One long unbreakable string (a URL as a description) and 200+ lines: text stays inside its column, the table paginates with a repeated header, and the totals block is never alone on a page.
3. Non-Latin text (a Devanagari client name) with a Latin-only embedded font: renders without throwing.
4. Hostile or junk accent values (`"red"`, `"#GGGGGG"`, `"#fff"`, `""`, `null`, near-white, near-black): never produce NaN colours, never reach the DB un-normalised, always resolve to a legible colour.
5. Mixed GST rates and odd paise: per-rate rows plus the CGST/SGST/IGST split always sum to the invoice's `totals.taxAmount` to the paisa.

---

## File Structure

- Create `lib/invoice-templates/shared/`: `tokens.ts`, `fonts.ts`, `format.ts`, `words.ts`, `qr.ts`, `qr-panel.ts`, `stamp.ts`, `table.ts`, `totals.ts`, `party-blocks.ts`
- Create `lib/invoice/gst-breakdown.ts`
- Create `lib/invoice-templates/tax-invoice-template.ts`, `pay-fast-template.ts`, `itemised-template.ts`, `catalog.ts`
- Create `assets/invoice-fonts/` (font files + OFL licence text)
- Create `components/invoice/AccentColorField.tsx`
- Create `prisma/migrations/20261121130000_invoice_accent_colors/migration.sql`
- Create `tests/invoice/` files named per task; `tests/invoice/helpers/pdf-text.ts`
- Modify `lib/invoice/build-invoice-view-model.ts`, `lib/invoice-templates/types.ts`, `index.ts`, `fixtures/sample-invoices.ts`, `lib/invoice-renderers/render-invoice-pdf.ts`, `lib/invoice/finalize-draft.ts`, `lib/invoice/generation-context.ts`, `app/api/generate/route.ts`, `prisma/schema.prisma`, `next.config.ts`, `package.json`, `lib/settings/schemas.ts`, `lib/settings/apply.ts`, `lib/clients/schema.ts`, `lib/clients/service.ts`, `app/(dashboard)/settings/_components/sections/Invoicing.tsx`, `app/(dashboard)/settings/_components/settings-data.tsx`, `app/(dashboard)/clients/_components/ClientFormDialog.tsx`, the invoice composer (`app/(dashboard)/income/_components/InvoiceDrawer.tsx` / `components/invoice/InvoiceGeneratorForm.tsx`, whichever hosts the composer), `messages/{en-IN,hi,es,ar}.json`

---

### Task 1: Dependencies, bundled font, unicode font set

**Files:**
- Modify: `package.json`, `next.config.ts`, `lib/invoice-templates/types.ts`, `lib/invoice-renderers/render-invoice-pdf.ts`
- Create: `assets/invoice-fonts/*`, `lib/invoice-templates/shared/fonts.ts`
- Test: `tests/invoice/fonts.unit.test.ts`

**Interfaces:**
- Produces:
  - `InvoiceTemplateMeta` gains optional `fonts?: "standard" | "unicode"` (default `"standard"`) and `defaultAccent?: string` (hex).
  - `loadInvoiceFontBytes(): Promise<{ regular: Uint8Array; bold: Uint8Array }>` (module-cached)
  - `embedUnicodeFonts(pdfDoc: PDFDocument): Promise<PdfFonts>` (registers fontkit, subsets; `oblique` reuses regular)
  - `safeText(font: PDFFont, text: string): string` (replaces characters the font cannot encode with `?`)

- [ ] **Step 1: Write failing tests** in `fonts.unit.test.ts`: `embedUnicodeFonts` returns fonts whose `getCharacterSet()` includes `0x20B9` (₹); `safeText(font, "शर्मा Traders")` does not throw and returns a string; drawing `₹1,23,456.00` on a page and saving yields a PDF that `PDFDocument.load` reopens; `renderInvoicePdf` of a vm whose template meta has `fonts: "unicode"` embeds the unicode font (a registered test template is enough).
- [ ] **Step 2: Run** `npx vitest run tests/invoice/fonts.unit.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Add deps** `@pdf-lib/fontkit`, `qrcode` (+ `@types/qrcode`), `pdfjs-dist` pinned to exact versions at least two weeks old. Commit Noto Sans (or Inter) regular and bold TTF/OTF plus its OFL licence under `assets/invoice-fonts/`; confirm the rupee glyph exists in the files you choose.
- [ ] **Step 4: Implement `fonts.ts`** (read files with `fs.promises.readFile`, cache the promise, `pdfDoc.registerFontkit`, `embedFont(bytes, { subset: true })`). Update `render-invoice-pdf.ts` to call `embedUnicodeFonts` when `template.meta.fonts === "unicode"`, else the existing Helvetica path unchanged.
- [ ] **Step 5: Standalone inclusion.** Add `outputFileTracingIncludes` (or the current equivalent in this Next version's docs) to `next.config.ts` so `assets/invoice-fonts/**` ships in `.next/standalone`. Run `npm run build`, then confirm the font files exist under `.next/standalone` and `node scripts/ci/standalone-smoke.mjs` conditions are not broken (it needs the disposable CI DB; if unavailable locally, record that CI will run it).
- [ ] **Step 6: Run** the test file — expect PASS. Run `npm run check:security-boundaries` (a CI step) and fix any new-dependency complaint.
- [ ] **Step 7: Commit** `feat(invoice): bundled unicode font set and fontkit support`

### Task 2: Accent tokens (pure)

**Files:**
- Create: `lib/invoice-templates/shared/tokens.ts`
- Test: `tests/invoice/accent-tokens.unit.test.ts`

**Interfaces:**
- Produces:
  - `MIN_ACCENT_CONTRAST = 3` (contrast ratio vs `#FFFFFF`; my call, the spec only says "minimum contrast against white")
  - `normalizeHexColor(input: unknown): string | null` — `#RGB`/`#RRGGBB`, with or without `#`, any case → `"#RRGGBB"` uppercase; anything else → `null`
  - `contrastRatio(hexA: string, hexB: string): number` (WCAG relative luminance)
  - `isAccessibleAccent(hex: string): boolean`; `nearestAccessibleAccent(hex: string): string` (darkens in HSL lightness until accessible)
  - `type AccentSource = "invoice" | "client" | "workspace" | "design"`
  - `resolveAccent(input: { invoice?: unknown; client?: unknown; workspace?: unknown; designDefault: string }): { hex: string; source: AccentSource }` — first candidate that normalises wins, made accessible via `nearestAccessibleAccent`
  - `type AccentTokens = { hex: string; accent: Color; accentDark: Color; accentTint: Color; accentTintStrong: Color; onAccent: Color }` and `buildAccentTokens(hex: string): AccentTokens` (`onAccent` = white or near-black, whichever contrasts better)

- [ ] **Step 1: Write failing tests:** `normalizeHexColor("#fff") === "#FFFFFF"`, `("1a2b3c") === "#1A2B3C"`; `"red"`, `"#GGGGGG"`, `""`, `null`, `undefined`, `42` → `null` (Review Focus 4). `contrastRatio("#000000","#FFFFFF")` ≈ 21; `isAccessibleAccent("#FFFF00") === false`, `("#0B5FFF") === true`. `resolveAccent` order: invoice beats client beats workspace beats design; invalid invoice value falls through to client; `{invoice:"#FFFF00"}` returns a darker accessible hex with source `"invoice"`; nothing set → `{hex: designDefault, source: "design"}`. `buildAccentTokens` never yields NaN channels for `#000000`, `#FFFFFF`, `#FFFF00`; `onAccent` is white on `#0B3D91` and near-black on a light accessible accent.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** in `tokens.ts` (pure, no pdf-lib import except `rgb`).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(invoice): accent colour tokens and resolution`

### Task 3: Amount in words and money formatting

**Files:**
- Create: `lib/invoice-templates/shared/words.ts`, `lib/invoice-templates/shared/format.ts`
- Test: `tests/invoice/words-format.unit.test.ts`

**Interfaces:**
- Produces: `amountInWords(amount: number, currency: string): string | null` (INR only; other currencies → `null`); `formatMoney(amount: number, currency: string, locale: string): string`

- [ ] **Step 1: Failing tests** (exact strings): `amountInWords(123456.5,"INR") === "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only"`; `(0,"INR") === "Rupees Zero Only"`; `(1,"INR") === "Rupees One Only"`; `(10000000,"INR") === "Rupees One Crore Only"`; `(99.01,"INR")` ends `"and One Paise Only"`; `(100,"USD") === null`; negative or non-finite → `null`. `formatMoney(123456.5,"INR","en-IN") === "₹1,23,456.50"`; `formatMoney(1000,"USD","en-US") === "$1,000.00"`; `formatMoney(0,"INR","en-IN") === "₹0.00"`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (lakh/crore grouping for words; `Intl.NumberFormat` with `style: "currency"` for format). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(invoice): amount in words and money formatting`

### Task 4: GST breakdown

**Files:**
- Create: `lib/invoice/gst-breakdown.ts`
- Test: `tests/invoice/gst-breakdown.unit.test.ts`

**Interfaces:**
- Consumes: `splitIntra`, `r2` from `lib/gst/money.ts`; `FOREIGN_POS`, `stateName` from `lib/gst/states.ts`.
- Produces:
  - `type GstInput = { supplierStateCode?: string | null; placeOfSupply?: string | null; reverseCharge?: boolean; supplyOverride?: string | null; irn?: string | null; irnAckNo?: string | null; irnAckDate?: Date | null }`
  - `type GstRateRow = { ratePercent: number; taxable: number; cgst: number; sgst: number; igst: number; total: number }`
  - `type GstBreakdown = { kind: "INTRA" | "INTER" | "EXPORT" | "NONE"; placeOfSupplyCode: string | null; placeOfSupplyName: string | null; rows: GstRateRow[]; cgst: number; sgst: number; igst: number; totalTax: number; reverseCharge: boolean; supplyOverride: string | null; irn: string | null; irnAckNo: string | null; irnAckDate: Date | null }`
  - `buildGstBreakdown(args: { lines: Array<{ amount: number; taxRate: number }>; gst?: GstInput; isExport: boolean; isTaxExempt: boolean; totalTaxAmount: number }): GstBreakdown` (`taxRate` is a fraction, e.g. `0.18`)

- [ ] **Step 1: Failing tests:** same state → `INTRA`, CGST = SGST = half; different states → `INTER` with IGST only; `placeOfSupply === "96"` or `isExport` → `EXPORT`, zero tax; exempt or no GST input → `NONE`; SEZ override → `INTER`. **Rounding (Review Focus 5):** lines `100.01@0.18` + `50.03@0.05` + `0.01@0.12` with an odd-paise `totalTaxAmount` — assert `rows.reduce(total) === totalTaxAmount` and `cgst + sgst + igst === totalTax === totalTaxAmount` to the paisa, comparing with exact `r2()` equality rather than `toBeCloseTo`. Empty `lines` → `kind: "NONE"`, no rows, no throw.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement:** group by rate; per-row tax = `r2(taxable * rate)`; the last row absorbs any difference so the sum equals `totalTaxAmount`; intra rows use `splitIntra`. **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(invoice): GST breakdown for invoice rendering`

### Task 5: Accent columns, migration, validation, persistence

**Files:**
- Modify: `prisma/schema.prisma` (`BusinessProfile.invoiceAccentColor String?`, `Client.invoiceAccentColor String?`, `Invoice.accentColor String?`), `lib/settings/schemas.ts`, `lib/settings/apply.ts`, `lib/clients/schema.ts`, `lib/clients/service.ts`, `lib/invoice/generation-context.ts`, `lib/invoice/finalize-draft.ts` (persist on create), `app/api/generate/route.ts`
- Create: `prisma/migrations/20261121130000_invoice_accent_colors/migration.sql`
- Test: `tests/invoice/accent-persistence.test.ts`

**Interfaces:**
- Consumes: `normalizeHexColor`, `isAccessibleAccent` (Task 2).
- Produces: `invoicingSchema` accepts optional `invoiceAccentColor: string | null | ""` (`""`/null clears); client schema and `InvoiceGenerationInput` accept `accentColor` / `invoiceAccentColor`; all three store the normalised `#RRGGBB` or `null`. Inaccessible colours are stored as given only if normalised, but rendering darkens them (Task 2); the picker (Task 16) is where users are warned.

- [ ] **Step 1: Failing tests** (Zod-level and service-level, no DB where possible): `invoicingSchema` accepts `"#0b5fff"` and outputs `"#0B5FFF"`, rejects `"red"`, `"#GGGGGG"`; `""` and `null` clear; client schema same; the generation-context sanitiser drops an invalid `accentColor` to `null` (Review Focus 4).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Edit `schema.prisma`**, hand-write the migration (three `ALTER TABLE ... ADD COLUMN ... TEXT` statements, table names as in the baseline migration), wire the schemas, `apply.ts` (`set("invoiceAccentColor", ...)` in the `invoicing` case), clients service, generation context and `finalize-draft` / generate route so the invoice row stores `accentColor`. Regenerate the Prisma client (`npx prisma generate`).
- [ ] **Step 3b:** Run `npm run check:migrations` against the disposable CI database if available (it needs `bababuilds_erp_ci` on localhost); otherwise `npx prisma validate` and say CI runs the rest.
- [ ] **Step 4: Run** the tests — PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(invoice): accent colour columns and validation`

### Task 6: View model extension and fixtures

**Files:**
- Modify: `lib/invoice/build-invoice-view-model.ts`, `lib/invoice-templates/fixtures/sample-invoices.ts`
- Test: `tests/invoice/view-model.unit.test.ts` (extend), `tests/invoice/view-model-lines.unit.test.ts`

**Interfaces:**
- Consumes: `buildGstBreakdown` (Task 4), `amountInWords` (Task 3), `normalizeHexColor` (Task 2).
- Produces (all additive; every existing `PDFParams` call keeps compiling):
  - `PDFParams` gains optional `lines?: PDFLine[]`, `gst?: GstInput`, `accentColor?: string | null`, `payment?: { paidOn?: Date | null; amountPaid?: number }`; `PDFProfile` gains optional `invoiceAccentColor?`, `gstStateCode?`; `PDFClient` gains optional `invoiceAccentColor?`, `gstStateCode?`.
  - `type PDFLine = { description: string; note?: string | null; quantity: number; unitPrice: number; discountAmount?: number; taxRate?: number | null; sacCode?: string | null; amount: number; section?: string | null }`
  - `InvoiceViewModel` gains: `lines: InvoiceLineView[]` (`description, note, quantity, quantityFormatted, unitPrice, unitPriceFormatted, discountAmount, taxRatePercent, sacCode, amount, amountFormatted, section`); `gst: GstBreakdown`; `accentCandidates: { invoice: string | null; client: string | null; workspace: string | null }`; `payment: { kind: "NONE" | "PARTIAL" | "PAID"; paidOn: Date | null; amountPaid: number; balanceDue: number }`; `amountInWords: string | null`; `paymentQrs: Array<{ kind: "PAYMENT_LINK"; url: string; label: string }>` (only the payment link in this stage).
  - Fallback: when `lines` is absent, derive them from `services` (quantity 1, unit price = amount, rate from `totals.taxRate` unless mixed). `payment.kind` follows `watermarkKind`; PAID → `amountPaid = totals.total`, `balanceDue = 0`.
  - New fixtures in `SAMPLE_INVOICES`: `gstIntra`, `gstInter`, `mixedRates` (18% and 5%), `emptyLines`, `zeroTotal`, `devanagariClient`, `manyLines` (200), `paidWithLink`, `partialWithBalance`, `accentInvoice`, `accentClient`.

- [ ] **Step 1: Failing tests:** derived lines for a legacy `services`-only fixture; explicit `lines` map through with formatted quantity/price; `gst.kind` per fixture; `accentCandidates` normalised (junk → `null`); `payment` for paid/partial/pending; `amountInWords` null for USD; `paymentQrs` has one entry when `paymentLink` is set and none when not; **existing assertions in `view-model.unit.test.ts` still pass unchanged**.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the additions and fixtures. **Step 4: Run** `npx vitest run tests/invoice` — PASS (including the existing PDF rendering tests; Classic/Modern output must still render).
- [ ] **Step 5: Commit** `feat(invoice): view model lines, GST, accent and payment state`

### Task 7: Pass real data into the renderer at the call sites

**Files:**
- Modify: `lib/invoice/finalize-draft.ts`, `app/api/generate/route.ts` (the two `generateInvoicePDF` calls built from `sanitizedServices`)
- Test: `tests/invoice/finalize-lines.test.ts`

**Interfaces:**
- Consumes: `PDFParams` additions (Task 6); `SanitizedService` has `quantity`, `unitPrice`, `taxRate`, `sacCode`.
- Produces: both call sites pass `lines` (from `sanitizedServices`), `gst` (supplier state from the profile's `gstStateCode`, place of supply / reverse charge / SEZ from `draftInput.gst`), `accentColor` (invoice override), `client.invoiceAccentColor`, `client.gstStateCode`, and `payment` (`amountPaid = total` when status is PAID).

- [ ] **Step 1: Failing test:** with `generateInvoicePDF` mocked (spread `importOriginal()`), finalising a draft with two services passes `lines` with the right `quantity`, `unitPrice`, `taxRate`, passes the invoice accent, and passes `client.invoiceAccentColor`; the old call shape (no new fields) still works.
- [ ] **Step 2–4:** run (FAIL), wire the fields, run (PASS). Other call sites (retainers, proposals, maintenance) stay as they are; they use the derived-lines fallback.
- [ ] **Step 5: Commit** `feat(invoice): pass line items, GST and accent to PDF rendering`

### Task 8: QR drawing

**Files:**
- Create: `lib/invoice-templates/shared/qr.ts`
- Test: `tests/invoice/qr.unit.test.ts`

**Interfaces:**
- Produces: `qrMatrix(text: string): boolean[][]` (error correction `M`); `drawQr(page: PDFPage, pageHeight: number, matrix: boolean[][], x: number, yFromTop: number, size: number, color: Color): void` (vector squares, quiet zone excluded, adjacent dark modules merged per row to keep the PDF small)

- [ ] **Step 1: Failing tests:** matrix for `"https://rzp.io/i/abc123"` is square and its top-left 7×7 is the finder pattern (outer ring dark, ring inside light, 3×3 centre dark); a longer URL gives a larger or equal matrix; drawing onto a page and extracting operators shows no embedded image; `drawQr` with an empty string does not throw and draws nothing.
- [ ] **Step 2–4:** FAIL, implement with `qrcode`'s `QRCode.create(text, { errorCorrectionLevel: "M" }).modules`, PASS.
- [ ] **Step 5: Commit** `feat(invoice): vector QR drawing`

### Task 9: PAID / PARTIAL stamp

**Files:**
- Create: `lib/invoice-templates/shared/stamp.ts`, `tests/invoice/helpers/pdf-text.ts`
- Test: `tests/invoice/stamp.test.ts`

**Interfaces:**
- Consumes: `AccentTokens` (Task 2), `InvoiceViewModel["payment"]` (Task 6), `drawInvoiceWatermark` (existing), `formatMoney` (Task 3).
- Produces:
  - `extractPdfText(bytes: Uint8Array): Promise<string[]>` (one string per page, via `pdfjs-dist/legacy/build/pdf.mjs`)
  - `drawPaymentStamp(args: { page: PDFPage; fonts: PdfFonts; vm: InvoiceViewModel; tokens: AccentTokens; anchorX: number; anchorYFromTop: number }): void` — draws nothing when `vm.payment.kind === "NONE"`
  - `drawPaymentWatermark(page: PDFPage, fonts: PdfFonts, vm: InvoiceViewModel): void` (wraps the existing faint watermark)

- [ ] **Step 1: Failing tests** (render onto a one-page document with the unicode fonts, extract text): PAID stamp contains `"PAID"` and the paid date (`vm.payment.paidOn`) when present; PARTIAL contains `"PARTIALLY PAID"` and the formatted balance due; `NONE` adds no content (page content stream length unchanged). The stamp's rotated bounding box (compute from anchor and size) stays within page margins.
- [ ] **Step 2–4:** FAIL, implement (bordered rounded rectangle, rotation about −12°, accent-independent red-brown "stamp" ink so it reads on any accent; double border; opacity so text underneath stays readable), PASS.
- [ ] **Step 5: Commit** `feat(invoice): shared PAID/PARTIAL stamp`

### Task 10: Line table

**Files:**
- Create: `lib/invoice-templates/shared/table.ts`
- Test: `tests/invoice/table.test.ts`

**Interfaces:**
- Consumes: `Paginator` (existing; `ensureRoom(yFromTop + rowHeight, minBottomY)` takes a y-from-top position, not a height), `wrapTextByWidth`, `drawText`, `drawRect`, `AccentTokens`.
- Produces:
  - `type TableColumn = { key: "description" | "sac" | "qty" | "rate" | "taxRate" | "discount" | "amount"; header: string; width: number; align: "left" | "right" | "center" }`
  - `drawLineTable(args: { paginator: Paginator; fonts: PdfFonts; tokens: AccentTokens; lines: InvoiceLineView[]; columns: TableColumn[]; x: number; startYFromTop: number; zebra?: boolean; sectionSubtotals?: boolean; emptyLabel: string; continuationTopY: number; reserveBottom?: number }): { page: PDFPage; yFromTop: number }`
  - `measureLineRow(fonts: PdfFonts, columns: TableColumn[], line: InvoiceLineView): number`

- [ ] **Step 1: Failing tests:** 3 lines fit on one page and return `yFromTop` below the last row; **200 lines (Review Focus 2)** produce several pages and the table header is redrawn at the top of every continuation page (assert via extracted text on each page); a 400-character unbreakable URL description never exceeds the description column width (assert `measureLineRow` row height is finite and text width per wrapped line ≤ column width); `reserveBottom` keeps the last row from leaving fewer than the reserved points so a totals block always has room with at least one row on its page; **zero lines (Review Focus 1)** draws `emptyLabel` and does not throw; `sectionSubtotals` emits one subtotal row per distinct `section`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(invoice): paginating line table`

### Task 11: Totals block and party blocks

**Files:**
- Create: `lib/invoice-templates/shared/totals.ts`, `lib/invoice-templates/shared/party-blocks.ts`
- Test: `tests/invoice/totals-party.test.ts`

**Interfaces:**
- Produces:
  - `measureTotalsBlock(vm: InvoiceViewModel, opts: { showGstSplit: boolean; showAmountInWords: boolean }): number`
  - `drawTotalsBlock(args: { page: PDFPage; fonts: PdfFonts; tokens: AccentTokens; vm: InvoiceViewModel; x: number; yFromTop: number; width: number; showGstSplit: boolean; showAmountInWords: boolean }): number` (returns bottom y-from-top). Rows: Subtotal; Discount (only if any line has one); CGST / SGST / IGST per `vm.gst` when `showGstSplit` and `vm.gst.kind` is `INTRA`/`INTER`, otherwise the single `vm.taxRowLabel` row; Total (emphasised, accent); amount in words when available. (TDS rows are Stage 2.)
  - `drawPartyBlock(args: { page: PDFPage; fonts: PdfFonts; tokens: AccentTokens; title: string; name: string; lines: string[]; taxId?: { label: string; value: string }; x: number; yFromTop: number; width: number }): number`

- [ ] **Step 1: Failing tests:** intra invoice text includes `CGST` and `SGST` and not `IGST`; inter includes `IGST` only; export fixture has no GST split and no ₹; `measureTotalsBlock` equals the height `drawTotalsBlock` actually used; Total row text equals `formatMoney(vm.totals.total, ...)`; long party names wrap inside `width`.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(invoice): totals and party blocks`

### Task 12: DESIGN_3 Tax Invoice

**Files:**
- Create: `lib/invoice-templates/tax-invoice-template.ts`
- Modify: `lib/invoice-templates/index.ts`
- Test: `tests/invoice/design-3-tax-invoice.test.ts`

**Interfaces:**
- Consumes: Tasks 1–11. Meta: `{ id: "DESIGN_3", title: "Tax Invoice", paperSize: "A4", supportsSignature: true, supportsPaymentLink: true, supportsMultiPage: true, fonts: "unicode", defaultAccent: "#0B3D91" }`.
- Layout (my call; refine in the visual review): top band with logo, "TAX INVOICE" and invoice number/dates; supplier and recipient party blocks with GSTIN/PAN; place-of-supply and reverse-charge / SEZ lines; HSN/SAC table with qty, rate, tax rate, taxable amount, tax and amount columns; tax summary table grouped by rate; totals; amount in words; IRN and acknowledgement block when present (text only; the e-invoice QR is a later stage); bank details; signature; footer with page numbers and the free-plan footer when `vm.showFreePlanFooter`.

- [ ] **Step 1: Failing tests** (render `gstIntra`, `gstInter`, `mixedRates`, `taxExemptExport`, `emptyLines`, `devanagariClient`, `manyLines`, `paid`, `partialWithBalance`): text contains `₹`, `CGST`/`SGST` or `IGST` as appropriate, the place-of-supply state name, and the amount in words; export has no GST split; `mixedRates` shows one summary row per rate; `manyLines` paginates and every page carries the invoice number; `devanagariClient` renders without throwing (Review Focus 3); `paid` text contains `PAID`; `emptyLines` renders. Accent: the same fixture with `accentInvoice` and with the default produces different page content streams. `getInvoiceTemplate("DESIGN_3").meta.id === "DESIGN_3"`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the template and add its import to `index.ts`. **Step 4: Run** — PASS.
- [ ] **Step 5: Visual review.** Render each fixture to a scratch dir (see Task 17's script) and view the PNGs; iterate on spacing, hierarchy and print legibility until it looks professional. Check black-and-white legibility by converting a PNG to greyscale.
- [ ] **Step 6: Commit** `feat(invoice): DESIGN_3 Tax Invoice`

### Task 13: DESIGN_4 Pay-Fast (with Scan-to-pay panel)

**Files:**
- Create: `lib/invoice-templates/pay-fast-template.ts`, `lib/invoice-templates/shared/qr-panel.ts`
- Modify: `lib/invoice-templates/index.ts`
- Test: `tests/invoice/design-4-pay-fast.test.ts`

**Interfaces:**
- Consumes: `drawQr`/`qrMatrix` (Task 8), `vm.paymentQrs`, `vm.payment`, `vm.remittanceDisplay`, `addLinkAnnotation`.
- Produces: `drawScanToPay(args: { page: PDFPage; pdfDoc: PDFDocument; fonts: PdfFonts; tokens: AccentTokens; vm: InvoiceViewModel; x: number; yFromTop: number; width: number }): number` (returns bottom y-from-top; `measureScanToPay(vm): number` alongside). Behaviour: `PAID` → "Paid in full, thank you" panel, **no QR**; sources present → QR with "Scan to pay", the amount due, and a clickable link; no sources → bank-details block; zero-total invoice → no QR. Meta: `{ id: "DESIGN_4", title: "Pay-Fast", ..., defaultAccent: "#0F766E" }`.
- Layout (my call): oversized "Amount due" and due date at the top; Scan-to-pay panel beside it; compact line table; totals; copyable bank block (account name, number, IFSC each on its own line); late-fee / terms line from `vm.dueDate`; footer.

- [ ] **Step 1: Failing tests:** `paidWithLink` has no QR operators beyond zero and its text contains `Paid in full`; an unpaid invoice with a link draws a QR (many rect operators) and a link annotation to the exact URL; unpaid without link shows the bank block and draws no QR; `zeroTotal` draws no QR; USD export fixture with a link still draws the QR and no `₹`; `partialWithBalance` text contains `PARTIALLY PAID` and the balance.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Visual review** as in Task 12 (A4 portrait; check that the QR is scannable by decoding the rendered PNG with any available decoder, otherwise state it was checked by eye at 100% zoom).
- [ ] **Step 6: Commit** `feat(invoice): DESIGN_4 Pay-Fast with Scan-to-pay panel`

### Task 14: DESIGN_5 Itemised Project

**Files:**
- Create: `lib/invoice-templates/itemised-template.ts`
- Modify: `lib/invoice-templates/index.ts`
- Test: `tests/invoice/design-5-itemised.test.ts`

**Interfaces:**
- Meta: `{ id: "DESIGN_5", title: "Itemised Project", ..., defaultAccent: "#4F46E5" }`. Uses `drawLineTable` with `sectionSubtotals: true`, columns description (with per-line note under it) / qty / rate / discount / amount, explicit discount row in totals, optional section headings from `line.section`.

- [ ] **Step 1: Failing tests:** two sections produce two section headings and two subtotal amounts that sum to `totals.subtotal`; a line note appears under its description; discount shows as its own column and row; `emptyLines`, `manyLines`, `devanagariClient`, `paid`, `partialWithBalance` render; accent changes page content.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Visual review.**
- [ ] **Step 6: Commit** `feat(invoice): DESIGN_5 Itemised Project`

### Task 15: Catalog and registry-driven picker

**Files:**
- Create: `lib/invoice-templates/catalog.ts`
- Modify: `lib/settings/schemas.ts` (replace `z.enum(["DESIGN_1","DESIGN_2"])`), `app/(dashboard)/settings/_components/sections/Invoicing.tsx` and `settings-data.tsx` (picker uses the catalog; initial value accepts any catalog id), `app/api/settings/route.ts` (reject unknown theme values), `messages/{en-IN,hi,es,ar}.json` (`SettingsHub.invoicing.design.DESIGN_3..5` and `designHint.DESIGN_3..5`)
- Test: `tests/invoice/catalog.unit.test.ts`

**Interfaces:**
- Produces: `INVOICE_DESIGN_CATALOG: ReadonlyArray<{ id: string; paperSize: PaperSize }>` and `INVOICE_DESIGN_IDS` (client-safe, no pdf-lib import).

- [ ] **Step 1: Failing tests:** the catalog ids equal `listInvoiceTemplates()` ids after importing `@/lib/invoice-templates` (guards drift); `invoicingSchema` accepts every catalog id and rejects `"DESIGN_99"`.
- [ ] **Step 2–4:** FAIL, implement, PASS. The picker renders one card per catalog entry with a distinct mini wireframe per design (build with the `frontend-design` skill: a calm, accessible card grid, one column on phones, selected state not colour-only, keyboard radio semantics kept).
- [ ] **Step 5:** `npm run ci:fast` (locale parity must pass). **Step 6: Commit** `feat(settings): registry-driven invoice design picker`

### Task 16: Accent colour UI (workspace, client, invoice)

**Files:**
- Create: `components/invoice/AccentColorField.tsx`
- Modify: `Invoicing.tsx` (workspace default), `ClientFormDialog.tsx` (client override), the invoice composer (invoice override), `settings-data.tsx`, `messages/*`
- Test: `tests/invoice/accent-field.test.tsx` (if the repo has a React testing setup; otherwise cover the pure helpers in Task 2 and rely on the browser check below)

**Interfaces:**
- Produces: `AccentColorField(props: { value: string | null; onChange: (hex: string | null) => void; label: string; inheritedFrom?: { source: "client" | "workspace" | "design"; hex: string }; disabled?: boolean })` — swatch row of curated accessible colours, a custom hex input, a "use inherited colour" clear action, a live contrast hint using `isAccessibleAccent` / `nearestAccessibleAccent` ("Too light to read, using this darker shade"), and a hint showing which level a currently inherited colour comes from.

- [ ] **Step 1:** Build the component and wire it into the three places with the labels "Invoice colour" (workspace), "Invoice colour for this client", and a compact override in the composer. Use the `frontend-design` skill; follow the PR template's UI gates; support dark mode, focus rings, 44px touch targets on `pointer-coarse:`, no horizontal scroll at 360px.
- [ ] **Step 2: Failing test** (if a React test setup exists): choosing a swatch calls `onChange` with the normalised hex; the clear action calls `onChange(null)`; a too-light typed colour shows the contrast hint.
- [ ] **Step 3–4:** implement, PASS.
- [ ] **Step 5: Browser check at phone width** with Playwright (`chromium.launch()` needs no options): open Settings → Invoicing, a client's form and the composer at 390×844 and 1280×800 in light and dark; save screenshots to the scratchpad, review them, fix layout problems, and report what was checked.
- [ ] **Step 6:** `npm run ci:fast`. **Step 7: Commit** `feat(invoice): accent colour controls for workspace, client and invoice`

### Task 17: Sample rendering, full verification, PR

**Files:**
- Create: `tests/invoice/render-samples.manual.test.ts` (skipped unless `RENDER_SAMPLES_DIR` is set; renders every fixture × every design `DESIGN_1..5` to that directory)
- Test: `tests/invoice/all-designs-render.test.ts`

- [ ] **Step 1: Failing test:** for every fixture and every registered design the renderer returns a PDF that `PDFDocument.load` reopens with at least one page, and DESIGN_1/DESIGN_2 page counts for existing fixtures equal their values before this stage (record them from the pre-change run).
- [ ] **Step 2–3:** run (FAIL where designs are missing, otherwise PASS), fix anything it finds.
- [ ] **Step 4: Visual pass.** `RENDER_SAMPLES_DIR=<scratch> npx vitest run tests/invoice/render-samples.manual.test.ts`, convert with `pdftoppm -r 110 -png`, view the PNGs for designs 3–5 on `gstIntra`, `mixedRates`, `paidWithLink`, `partialWithBalance`, `manyLines`, `taxExemptExport`; fix visible defects. Confirm Classic and Modern look unchanged.
- [ ] **Step 5: Full gates:** `npm run ci:fast` (must be green), `npm run build`; list anything that could only run in CI.
- [ ] **Step 6:** Push to `claude/modest-bell-nxenr3`, update PR #686's description to cover Stage 1, watch CI, and report outcomes faithfully.

---

## Self-Review

- **Spec coverage (Stage 1):** shared kit (Tasks 1–11), fonts incl. standalone (1), view-model extension (6–7), stamp (9), accent three-level resolution (2, 5, 16), migration (5), settings plumbing and registry-driven picker (15), designs 3–5 (12–14), Scan-to-pay panel with fallback and paid behaviour (13). Deferred by design to later stages: TDS, UPI/static QR, comparison page, Redis, dynamic QR, designs 6–8.
- **Type consistency:** `AccentTokens`, `PDFLine`, `InvoiceLineView`, `GstBreakdown`, `drawLineTable`, `drawTotalsBlock`, `drawScanToPay`, `drawPaymentStamp` are named identically where produced and consumed. `paginator.ensureRoom` takes a y-from-top position (noted in Task 10).
- **Review Focus coverage:** 1 → Tasks 10, 12, 13; 2 → Tasks 10, 12; 3 → Tasks 1, 12, 14; 4 → Tasks 2, 5; 5 → Task 4.
- **My calls (not from the spec):** minimum accent contrast of 3:1 against white; Noto Sans/Inter choice left to the implementer; default accents per design; `pdfjs-dist` added now for text-extraction tests; stamp ink colour independent of the accent.
