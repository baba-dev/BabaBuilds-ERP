# Invoice Designs, Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native execution was chosen) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add TDS (expected withholding) to invoices end to end, and three more designs: Statement (`DESIGN_6`), Minimal Pro (`DESIGN_7`) and a thermal Receipt (`DESIGN_8`).

**Architecture:** Builds on the stage 1 kit (`lib/invoice-templates/shared/`) and view model. TDS is computed once from the pre-GST subtotal, flows through generation context, payment-link amount, view model and the shared totals block, so every design shows it. Statement data comes from a pure builder over invoices, payments and credit notes with a thin Prisma loader.

**Tech Stack:** unchanged from stage 1 (pdf-lib, Vitest, Prisma, next-intl). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-invoice-designs-design.md` (TDS, Statement, Minimal Pro, Receipt sections). Stage 1 plan: `docs/superpowers/plans/2026-11-21-invoice-designs-stage-1.md`.

## Global Constraints

- TDS base is the amount **before GST**. Totals block reads: Subtotal, GST, Total, less TDS @ x% (Sec), **Net payable**. Supplier PAN is printed with the TDS rows.
- When TDS applies, the Razorpay payment link (and the QR in Pay-Fast and the Receipt) uses the **net payable** amount.
- Existing `Invoice.withholding*` fields record deductions that actually happened (with a `WithholdingEvent`); do not reuse them for expected TDS. Use new `tds*` fields.
- Design IDs: Statement = `DESIGN_6`, Minimal Pro = `DESIGN_7`, Receipt = `DESIGN_8` (thermal 80mm, `THERMAL_80MM`, small QR at the end of the receipt).
- All new designs: PAID/PARTIAL stamp support (the receipt uses a compact inline "PAID" line), accent resolution chain, bundled font (`fonts: "unicode"`), no headless browser, no new dependencies, no Redis.
- Migrations: new folder sorting after `20261121130000_invoice_accent_colors`; `npm run check:migrations` passes (a local PG16 on port 5433 is available; `DATABASE_URL=postgresql://postgres@localhost:5433/bababuilds_erp_ci`).
- Run `npm run ci:fast` before pushing; chain `tsc && eslint && vitest` before every commit; add no lint warnings; locale parity in en-IN, hi, es, ar; UI follows the frontend-design bar and the Android conventions; never write dev-server logs inside the repo tree.
- Classic and Modern output must not change (`tests/invoice/all-designs-render.test.ts` guards it).

## Review Focus

1. TDS on an exempt, export or zero-total invoice: no TDS rows, no negative net payable, no divide-by-zero; rate 0 or empty means no TDS.
2. Net payable never goes below zero and the QR/link never encodes the gross when TDS applies.
3. Statement with no previous balance, with more open items than fit, with a credit larger than the balance, and for a client's first invoice.
4. Receipt with a very long item list (page length), a Devanagari client name and no payment link (no QR, no crash).
5. Hostile or junk TDS input (`"abc"`, negative, above 100, huge): rejected or clamped, never stored as NaN.

---

## File Structure

- Create `lib/invoice/tds.ts`, `lib/invoice/statement.ts`, `lib/invoice-templates/{statement,minimal,receipt}-template.ts`
- Create `prisma/migrations/20261121140000_invoice_tds/migration.sql`
- Modify `prisma/schema.prisma`, `lib/invoice/build-invoice-view-model.ts`, `lib/invoice/generation-context.ts`, `lib/invoice/generate-schema.ts`, `lib/invoice/finalize-draft.ts`, `lib/invoice/pdf-params.ts`, `app/api/generate/route.ts`, `app/api/generate/preview/route.ts`, `lib/clients/schema.ts`, `lib/clients/service.ts`, `lib/invoice-templates/shared/{totals,table,page-chrome}.ts`, `lib/invoice-templates/{tax-invoice,pay-fast,itemised}-template.ts`, `lib/invoice-templates/{index,catalog}.ts`, `lib/invoice-templates/fixtures/sample-invoices.ts`, client form, composer, Settings picker, `messages/*`
- Tests under `tests/invoice/`

---

### Task 1: TDS core (math, schema, persistence, payment-link amount)

**Files:** Create `lib/invoice/tds.ts`, migration; modify schema, generate schema, generation-context, finalize-draft, generate and preview routes, clients schema/service. Test: `tests/invoice/tds.unit.test.ts`.

**Interfaces — Produces:**
- `type TdsInput = { section?: string | null; ratePercent?: number | null }`
- `computeTds(args: { subtotal: number; ratePercent: number | null | undefined; isTaxExempt?: boolean; isExport?: boolean }): { ratePercent: number; amount: number } | null` — null when rate missing/0/non-finite, export, or subtotal <= 0; clamps rate to 0–100; `amount = round2(subtotal * rate / 100)`.
- `netPayable(total: number, tdsAmount: number | null | undefined): number` — `max(0, round2(total - tds))`.
- `normalizeTdsSection(input: unknown): string | null` — trims, max 12 chars, `[A-Za-z0-9() ]`, else null (e.g. `"194J"`).
- Schema columns: `Client.tdsSection String?`, `Client.tdsRatePercent Float?`, `Invoice.tdsSection String?`, `Invoice.tdsRatePercent Float?`, `Invoice.tdsAmount Decimal?`.
- `InvoiceGenerationInput.tds?: { section?: string | null; ratePercent?: number | null }`; `GenerateInvoiceSchema.tds` validates (rate 0–100, section via the same rule); context exposes `tds: { section: string | null; ratePercent: number; amount: number } | null` and `netPayable: number`; invoice rows store `tdsSection/tdsRatePercent/tdsAmount`; Razorpay link amount in both routes is `netPayable`.

- [ ] **Step 1: Failing tests** (`tds.unit.test.ts`): `computeTds({subtotal:16000, ratePercent:10})` → `{ratePercent:10, amount:1600}`; rate on pre-GST subtotal (total 18880 must not matter); `null` for rate 0, `undefined`, `NaN`, `-5`→null, `150`→clamped to 100; `null` for export, zero subtotal; `netPayable(18880,1600)===17280`, `netPayable(100,500)===0`, `netPayable(100,null)===100`; `normalizeTdsSection(" 194J ")==="194J"`, `("<script>")===null`, `("")===null`, 13+ chars → null. GenerateInvoiceSchema accepts `tds:{section:"194J",ratePercent:10}`, rejects `ratePercent:"abc"`, `-1`, `101`. Client `normalizeClientInput({tdsSection:"194J", tdsRatePercent:"10"})` stores `"194J"`/`10`; `"abc"` → field issue `tdsRatePercent`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** as specified; migration adds the five nullable columns; wire client schema/service, generate schema, context (compute from `totals.subtotal`), both persist sites, and both payment-link calls (`amount: netPayable`). Regenerate Prisma client; run `npm run check:migrations`.
- [ ] **Step 4: Run** tests, `tsc`, `eslint`. **Step 5: Commit** `feat(invoice): expected TDS fields, maths and net-payable payment link`.

### Task 2: TDS in the view model and every design

**Files:** Modify `build-invoice-view-model.ts`, `pdf-params.ts` (no change needed unless new helper), `finalize-draft.ts`/`generate/route.ts` (pass `tds`), `shared/totals.ts`, the three stage-1 templates, fixtures. Test: `tests/invoice/tds-render.test.ts`.

**Interfaces — Produces:** `PDFParams.tds?: { section?: string | null; ratePercent: number; amount: number }`; `InvoiceViewModel.tds: { section: string | null; ratePercent: number; amount: number; sectionLabel: string } | null` and `InvoiceViewModel.netPayable: number` (= total when no TDS); `vm.payment` uses `netPayable` as the amount to settle (PAID default `amountPaid = netPayable`, `balanceDue = max(0, netPayable - amountPaid)`). `buildRows` in `totals.ts` appends, after Total, a muted row `Less: TDS @ 10% (Sec 194J)` with `-₹1,600.00` and an emphasised `Net payable` row, plus a muted line `Our PAN: ABCDE1234F` when TDS applies and the supplier has a PAN. `measureTotalsBlock` accounts for them. Pay-Fast hero shows `netPayable` as the amount due and the QR panel's amount is net.
New fixtures: `tdsInvoice` (gstIntra lines, TDS 10% Sec 194J), `tdsInvoiceWithLink` (unpaid, with a payment link), `tdsExempt` (export with a TDS request, must show none).

- [ ] **Step 1: Failing tests:** for DESIGN_3/4/5 `tdsInvoice` text contains `Less: TDS @ 10% (Sec 194J)`, `-₹1,600.00`, `Net payable`, `₹17,280.00`, `Our PAN: ABCDE1234F`; `netPayable` on the vm is 17280 and `payment.balanceDue` is 17280; `tdsExempt` shows no `TDS`; a fixture without TDS is unchanged (`basic` text has no `Net payable`); Pay-Fast hero shows `₹17,280.00` and the QR panel's amount is `₹17,280.00`; zero-total invoice with a TDS rate shows no TDS rows.
- [ ] **Step 2–4:** FAIL, implement, PASS (also re-run the Classic/Modern baseline test). **Step 5: visual review** of `tdsInvoice` in all three designs. **Step 6: Commit** `feat(invoice): TDS rows and net payable in all new designs`.

### Task 3: TDS in the client form and the invoice composer

**Files:** `ClientFormDialog.tsx` + `shared.tsx` (client TDS section and rate, domestic only), `InvoiceGeneratorForm.tsx` (toggle "Client deducts TDS" with section/rate inputs prefilled from the selected client, a live "Net payable" line, payload `tds`), `messages/*` (new keys in `ClientsCrm.form` and `InvoiceComposer`).

- [ ] **Step 1:** Build with the frontend-design bar: mobile-first, 44px touch targets on `pointer-coarse:`, visible focus, light and dark, inline validation (rate 0–100, section format), the toggle disabled when the invoice is an export or tax-exempt.
- [ ] **Step 2: Browser check** at 390×844 and 1280×900 (log the dev server outside the repo; set `DEMO_CIRCUIT_BREAKER_THRESHOLD=500`; reuse one saved login). Check the composer shows net payable updating, and the client form saves and reloads the TDS default.
- [ ] **Step 3:** `npm run ci:fast`. **Step 4: Commit** `feat(invoice): TDS controls in the client form and composer`.

### Task 4: Statement data

**Files:** Create `lib/invoice/statement.ts`; modify `build-invoice-view-model.ts`, `finalize-draft.ts`, `generate/route.ts`, fixtures. Test: `tests/invoice/statement.unit.test.ts`.

**Interfaces — Produces:**
- `type StatementInput = { previousBalance: number; openItems: Array<{ number: string; date: Date; dueDate: Date | null; balance: number }>; payments: Array<{ date: Date; amount: number; method: string | null; reference: string | null }>; credits: Array<{ number: string; date: Date; amount: number }>; sinceDate: Date | null }`
- `buildStatement(args: { invoices: Array<{ number: string; date: Date; dueDate: Date | null; total: number; status: string; payments: Array<{ amount: number; receivedAt: Date; method: string; reference: string | null; reversedAt: Date | null }>; creditNotes: Array<{ number: string; amount: number; taxAmount: number; issuedAt: Date }> }>; currentInvoiceDate: Date }): StatementInput` — pure. Open items = earlier non-void invoices with a balance above zero (balance = total − live payments − credit notes, floored at 0), oldest first, capped at the 8 oldest for display with `previousBalance` still the full sum; `sinceDate` = date of the client's previous invoice; payments and credits are those received/issued after `sinceDate` (all, when there is no previous invoice).
- `loadClientStatement(workspaceId: string, clientId: string, currentInvoiceDate: Date): Promise<StatementInput>` — Prisma query feeding `buildStatement`.
- `PDFParams.statement?: StatementInput`; `InvoiceViewModel.statement: (StatementInput & { amountDueNow: number }) | null` where `amountDueNow = previousBalance + netPayable`.

- [ ] **Step 1: Failing tests:** two earlier invoices (one part-paid, one fully paid, one void) → open items only the part-paid one with the right balance; a credit note larger than the balance floors at 0; first invoice → `previousBalance 0`, no items, `sinceDate null`; reversed payments are ignored; more than 8 open items → 8 shown, `previousBalance` the full sum; payments before `sinceDate` excluded.
- [ ] **Step 2–4:** FAIL, implement (finalize and generate call `loadClientStatement` only when the resolved design is `DESIGN_6`, to avoid the query otherwise), PASS. **Step 5: Commit** `feat(invoice): client statement data for the Statement design`.

### Task 5: Minimal table style

**Files:** modify `shared/table.ts`; test in `tests/invoice/table.test.ts`.
**Interfaces:** `drawLineTable` args gain `style?: "filled" | "minimal"` (default `"filled"`, behaviour unchanged). Minimal: no header fill, header text in muted caps with a 1pt rule below, no zebra, no section fills (sections as bold text rows), thin row rules.

- [ ] **Step 1: Failing test:** with `style:"minimal"` no accent-filled rectangles are drawn (compare `countRects` against filled), header and rows still appear, pagination still repeats the header. **Step 2–4:** FAIL, implement, PASS, existing table tests pass. **Step 5: Commit** `feat(invoice): minimal line table style`.

### Task 6: DESIGN_6 Statement

**Files:** Create `statement-template.ts`; modify `index.ts`; test `design-6-statement.test.ts`. Meta `{ id: "DESIGN_6", title: "Statement", paperSize: "A4", fonts: "unicode", defaultAccent: "#7C3AED" }`.
Layout: header; **summary band** with Previous balance, Payments received, Credits applied, This invoice, and a large **Amount due now**; "Open items" table (invoice no., date, due, balance) with an "and N more" line when capped; "Payments received" table (date, method, reference, amount) and credits; then "This invoice" with `drawLineTable` and the totals block; bank details; stamp.

- [ ] **Step 1: Failing tests** (fixtures `statementInvoice` with two open items, a payment and a credit; `statementFirst` with no history; `statementManyOpen` with 12 open items): summary values and `Amount due now` (previous balance + net payable) appear; open item numbers appear; `And 4 more` for 12 items; first invoice shows `No previous balance` and no open-items table; paid stamp works; accent chain; many lines paginate; Devanagari renders; export fixture has no `₹`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: visual review** (statementInvoice, statementFirst, statementManyOpen, tdsInvoice). **Step 6: Commit.**

### Task 7: DESIGN_7 Minimal Pro

**Files:** Create `minimal-template.ts`; test `design-7-minimal.test.ts`. Meta `{ id: "DESIGN_7", title: "Minimal Pro", paperSize: "A4", fonts: "unicode", defaultAccent: "#111827" }`.
Layout: lots of whitespace, one accent used only for the amount due and a thin rule; "Invoice" small title top left, brand name or logo right; two-column meta; minimal table (Task 5); totals as plain right-aligned lines with the grand total larger (no filled bar); bank details and a single "Pay online" link when present; stamp supported; footer from page chrome.

- [ ] **Step 1: Failing tests:** registers; shows number, dates, parties, lines, total, TDS rows on `tdsInvoice`; draws far fewer filled rectangles than DESIGN_3 for the same fixture (it is the minimal design); empty, zero, Devanagari, 200 lines, paid, partial, accent chain. **Step 2–4:** FAIL, implement, PASS. **Step 5: visual review. Step 6: Commit.**

### Task 8: DESIGN_8 Receipt (thermal)

**Files:** Create `receipt-template.ts`; modify `types.ts` only if needed; test `design-8-receipt.test.ts`. Meta `{ id: "DESIGN_8", title: "Receipt", paperSize: "THERMAL_80MM", fonts: "unicode", supportsMultiPage: true, defaultAccent: "#111111" }`.
Layout (226.77pt wide, 12pt margins): centred name (logo if any), address and GSTIN; title and number/date; customer; items as a name line then `qty x rate ........ amount`; subtotal, tax (CGST/SGST when known), total, TDS/net payable rows when present; payment status as a compact inline line (`PAID  30 Apr 2026` or `PARTIALLY PAID  Balance ₹…`); **small QR at the end** (about 64pt) from the first payment source, with its amount, only when unpaid and a payment source exists; thank-you line. After drawing, the last page is cropped to its content height (`page.setSize` plus `page.translateContent(0, newHeight - 1000)`).

- [ ] **Step 1: Failing tests:** page width is 226.77 and height is less than 1000 and more than the content (a short receipt is about 300–450pt); contains total, items, `PAID` line for a paid fixture; unpaid with link draws a QR (rect count higher than the same without link) and the link text; paid never draws the QR; no link → no QR, no crash; 60 items → more than one page or a taller page without overflow (assert no text below the page bottom with `extractTextItems`); Devanagari name renders; USD fixture has no `₹`; TDS fixture shows net payable. **Step 2–4:** FAIL, implement, PASS. **Step 5: visual review** (render at 110dpi). **Step 6: Commit.**

### Task 9: Catalog, picker, translations for designs 6–8

**Files:** `catalog.ts` (add ids; `paperSize` from a map), `Invoicing.tsx` (wireframes), `messages/*`, tests: update `catalog.unit.test.ts`, `all-designs-render.test.ts` (eight designs; all fixtures; receipt included).
- [ ] **Step 1: Failing test** (catalog lists eight ids and equals the registry; locale keys exist for DESIGN_6–8 in four locales). **Step 2–4:** FAIL, implement (textual insertion of translations), PASS. **Step 5:** `npm run ci:fast`. **Step 6: Commit.**

### Task 10: Full verification and PR

- [ ] Full `npm run ci:fast`; `npm run build` locally; Classic/Modern baseline test green; render every new design for the key fixtures and look at them; push, update PR #686's description to stage 2, watch CI and fix what it reports. Ledger rulings and deferred minors go in the final message.

---

## Self-Review

- **Spec coverage:** TDS (client default, per-invoice toggle, pre-GST base, net payable, PAN, link and QR net) → Tasks 1–3; Statement → 4, 6; Minimal Pro → 5, 7; Receipt with small end QR and inline PAID → 8; picker/translations → 9. UPI/static QR, comparison page, Redis and dynamic QR remain stages 3–4.
- **Type consistency:** `computeTds`/`netPayable`, `StatementInput`, `vm.tds`, `vm.netPayable`, `vm.statement`, `style` option are named identically across tasks.
- **My calls:** expected TDS gets its own columns (not the actual-deduction `withholding*` fields); statement shows at most 8 open items; the Receipt QR is the payment-link QR until stage 3 adds UPI; the Receipt page is cropped to content height.
