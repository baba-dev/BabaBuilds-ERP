# Invoice Designs, Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native execution) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** UPI ID and static QR images (Settings, onboarding, invoices), and a "compare all designs" page that previews the user's latest invoice in all eight designs, backed by a Redis preview cache.

**Architecture:** UPI/static QR sources join `vm.paymentQrs`; Pay-Fast gets a "More ways to pay" row and the Receipt picks one QR by priority. A pure builder turns an invoice row into the same `PDFParams` the generator uses, so previews are rendered by the real templates with no side effects. Previews are cached content-addressed (hash of params + design + template version) in Redis when enabled, with an in-process LRU otherwise; rendering is capped and single-flighted. The page draws pages with `pdfjs-dist` on the client.

**Tech Stack:** unchanged (pdf-lib, pdfjs-dist already installed, sharp, ioredis through `lib/redis`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-invoice-designs-design.md`. Earlier stages: `...-stage-1.md`, `...-stage-2.md`.

## Global Constraints

- UPI link is the standard `upi://pay?pa=&pn=&am=&cu=INR&tn=` URI; amount is the **net payable** (or balance due); INR invoices only.
- Uploaded static QR images: up to 3 per workspace, stored privately and workspace-namespaced like signatures, normalised with `sharp`; they carry no amount, so the design prints "Enter amount X, reference INV-…".
- QR priority: Razorpay payment link (reconcilable) first, then UPI ID, then uploaded images. Receipt shows one QR (first by that priority). A paid invoice shows no pay-now QR.
- UPI ID and QR images are optional everywhere; onboarding never blocks on them. The wizard collects only the UPI ID (images need a saved profile, so they live in Settings → Banking).
- Preview endpoint: authenticated, workspace-scoped, rate limited, side-effect free (no payment link creation, no files written), never trusts client-supplied invoice data (only an invoice id the workspace owns).
- Redis only through `lib/redis` (flags `ERP_REDIS_*`, fail-fast, namespaced). Everything works with Redis off. Never cache anything that is not content-addressed by the params hash.
- Earlier global constraints still apply: migrations after `20261121140000_invoice_tds`, `npm run check:migrations`, chain `tsc && eslint && vitest` before each commit, `npm run ci:fast` before pushing, locale parity (en-IN, hi, es, ar), frontend-design bar and Android conventions, dev-server logs outside the repo, `DATABASE_URL=postgresql://postgres@localhost:5433/bababuilds_erp_ci`, Classic/Modern output unchanged.

## Review Focus

1. A malformed or hostile UPI ID (`"a b@c"`, `"x"`, 200 chars, `"javascript:alert(1)"`) and a payee name with `&`, `?`, `%`, non-Latin text: rejected or safely encoded in the URI, never breaking the QR.
2. Uploaded QR image that is not an image, an SVG, a huge image, a decompression-bomb size, or a 4th upload: rejected with a clear message.
3. Preview of an invoice that belongs to another workspace, a voided invoice, a deleted client, or an invoice with no items: 404 or a clean render, never another tenant's data.
4. Concurrent previews (8 tiles, several tabs): one render per distinct key, bounded CPU; Redis down or erroring: renders anyway.
5. A client-supplied accent or TDS value on the preview: normalised/clamped, never reaching the DB.

---

## Tasks

### Task 1: UPI maths and QR image storage

**Files:** Create `lib/invoice/upi.ts`, `lib/settings/payment-qr.ts`; migration `20261121150000_upi_payment_qr`; modify `schema.prisma`, `lib/uploads/private-storage.ts` (add kind `payment-qr`); create `app/payment-qr/[...path]/route.ts`. Tests: `tests/invoice/upi.unit.test.ts`, `tests/invoice/payment-qr-store.test.ts`.

**Interfaces — Produces:**
- `normalizeUpiVpa(input: unknown): string | null` (lower-cased `handle@provider`, 3–60 chars, `[a-z0-9._-]+@[a-z][a-z0-9.-]+`, no spaces)
- `normalizePayeeName(input: unknown): string | null` (trim, 1–60 chars, control chars removed)
- `buildUpiUri(args: { vpa: string; payeeName?: string | null; amount?: number | null; note?: string | null }): string | null` — `upi://pay?pa=<vpa>&pn=<encoded>&am=<2dp>&cu=INR&tn=<encoded ≤50>`; `null` for an invalid VPA; omits `am` when amount is missing or ≤ 0.
- Schema: `BusinessProfile.upiVpa String?`, `BusinessProfile.upiPayeeName String?`; `model PaymentQrImage { id, workspaceId (FK cascade), label String, imagePath String, sortOrder Int @default(0), createdAt }` with `@@index([workspaceId, sortOrder])`.
- `storePaymentQrImage(workspaceId: string, label: string, file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }>` — png/jpg/webp only (content sniffed, not just extension), ≤ 1 MB, ≤ 3000×3000 px, malware scan, re-encoded to PNG ≤ 800 px with sharp.
- `MAX_PAYMENT_QR_IMAGES = 3`.

- [ ] **Step 1: Failing tests:** VPA accept/reject table (including the Review Focus 1 inputs); `buildUpiUri` exact string for `{vpa:"shop@okhdfc", payeeName:"Baba & Sons", amount:17280, note:"INV/26-27/001"}` (assert `pn=Baba%20%26%20Sons`, `am=17280.00`, `tn=INV%2F26-27%2F001`, `cu=INR`), amount 0/NaN/undefined omits `am`, note truncated to 50, invalid VPA → null; `storePaymentQrImage` with a tiny real PNG stores and returns a `/payment-qr/<workspace>/…` path (temp `PRIVATE_UPLOADS_DIR`), rejects a text file renamed `.png`, an SVG, an oversized file, an image above 3000 px.
- [ ] **Step 2–4:** FAIL, implement (reuse `sniffAllowedContent`, `scanBuffer`, `uniqueStoredName`), PASS; `npm run check:migrations`.
- [ ] **Step 5: Commit** `feat(invoice): UPI link maths and payment QR image storage`.

### Task 2: Settings API and Banking UI

**Files:** `lib/settings/schemas.ts` (`bankingSchema` gains `upiVpa`, `upiPayeeName`), `lib/settings/apply.ts` (banking case), create `app/api/settings/payment-qr/route.ts` (POST multipart `label`+`file`, DELETE `id`), `settings-data.tsx` (+ `upiVpa`, `upiPayeeName`, `paymentQrs` list), `app/api/settings/route.ts` GET returns the QR list (id, label, imageUrl), `Banking.tsx` ("UPI & QR" card), messages in four locales. Tests: `tests/invoice/upi-settings.test.ts`.

- [ ] **Step 1: Failing tests:** banking schema accepts a valid VPA (normalised) and empty (clears), rejects junk; the route helper rejects a 4th image (`MAX_PAYMENT_QR_IMAGES`), requires settings-manager permission, deletes only the caller's workspace rows, deletes the stored file.
- [ ] **Step 2–4:** FAIL, implement, PASS. UI (frontend-design bar): a "UPI & QR" card in Banking with the UPI ID field and payee name, up to 3 labelled QR slots with image preview, upload and remove, a plain-language note ("A UPI ID makes a QR with the exact amount; uploaded QRs make the customer type the amount"), mobile-first (44px targets on `pointer-coarse:`), focus rings, light/dark.
- [ ] **Step 5: Browser check** at 390×844 and 1280×900 (dev server logs outside the repo; restart it if it loops). **Step 6:** `npm run ci:fast`. **Step 7: Commit.**

### Task 3: Payment QR sources in the view model, Pay-Fast and Receipt

**Files:** `build-invoice-view-model.ts`, `shared/qr-panel.ts`, `shared/pdf-primitives.ts` (add `loadPrivateImage`), `pay-fast-template.ts`, `receipt-template.ts`, `lib/invoice/pdf-params.ts`, fixtures. Tests: `tests/invoice/payment-qr-render.test.ts`.

**Interfaces — Produces:**
- `PDFParams.upi?: { vpa: string; payeeName?: string | null }`, `PDFParams.staticQrs?: Array<{ label: string; imagePath: string }>`.
- `InvoiceQrSource` becomes `{ kind: "PAYMENT_LINK"; url; label } | { kind: "UPI"; uri: string; label: string } | { kind: "STATIC_IMAGE"; imagePath: string; label: string }`. `vm.paymentQrs` order: payment link, UPI, static images (max 3 after the link). UPI source only when INR, `due > 0`, not paid, and the VPA is valid; its URI uses `vm.netPayable` (or the balance due) and the invoice number as the note.
- `loadPrivateImage(pdfDoc: PDFDocument, url: string): Promise<PDFImage | null>` (same private-path logic as `loadLogo`, never throws).
- `drawMoreWaysToPay(args: { page; pdfDoc; fonts; tokens; vm; x; yFromTop; width }): Promise<number>` — draws the sources after the first (UPI QR, then images, up to 3, 64pt each, labelled; static images get "Enter amount ₹X, ref INV-…") and returns its bottom y; draws nothing and returns `yFromTop` when there is nothing to show.
- `scanPanelMode` and the Pay-Fast hero keep working; the first QR source feeds the main panel (a UPI-only workspace gets the UPI QR in the panel); Receipt draws exactly one QR: the first source (a static image is drawn as an image).

- [ ] **Step 1: Failing tests:** fixtures `upiOnly`, `upiAndStatic`, `staticOnly` (the static image is a real tiny PNG written to a temp private dir by the test); vm source ordering and `uri` content (net amount for the TDS fixture); Pay-Fast with link + UPI + 2 images shows "More ways to pay", "UPI", both labels, `Enter amount`, and has more filled shapes than link-only; paid → none of it; USD invoice → no UPI; receipt picks link over UPI over image and draws exactly one; UPI QR decodes? (assert matrix equals `qrMatrix(uri)` via rect count parity rather than decoding); invalid VPA → silently no UPI source; missing image file → skipped without throwing.
- [ ] **Step 2–4:** FAIL, implement, PASS; Classic/Modern baseline still green. **Step 5: Visual review** (render Pay-Fast and Receipt; decode the UPI QR with OpenCV: expect the exact `upi://` string). **Step 6: Commit.**

### Task 4: Feed UPI and QR images into generation

**Files:** create `lib/invoice/payment-qr-loader.ts` (`loadPaymentQrSettings(workspaceId)`), modify `finalize-draft.ts`, `generate/route.ts`. Test: pure mapping in `tests/invoice/pdf-params.unit.test.ts` (`toPdfPaymentQrs`).

- [ ] **Step 1: Failing test** for `toPdfPaymentQrs(profile, images)` (empty/valid/invalid VPA, order by `sortOrder`, max 3). **Step 2–4:** FAIL, implement, call it only when the workspace design is `DESIGN_4` or `DESIGN_8`, PASS, `tsc`. **Step 5: Commit.**

### Task 5: Onboarding

**Files:** `components/setup/SetupWizard.tsx` (optional "UPI ID (optional)" field with a hint, on the Business Identity step in full mode), `app/api/setup/route.ts` (accept and normalise `upiVpa` through `normalizeUpiVpa`; invalid → field error), messages. Tests: `tests/invoice/setup-upi.test.ts` (the route's validation helper).

- [ ] **Step 1–4:** failing test for the validation helper (valid, empty, junk), implement, PASS. **Step 5:** browser check of the wizard step if reachable (a fresh demo skips setup, so verify by rendering the component in the existing flow or note it as unchecked). **Step 6: Commit.**

### Task 6: Preview params builder

**Files:** create `lib/invoice/preview-params.ts`. Test: `tests/invoice/preview-params.unit.test.ts`.

**Interfaces — Produces:**
- `mapInvoiceToParams(row: PreviewInvoiceRow, extras: { profile; payments; statement?; upi?; staticQrs? }): PDFParams` (pure): number, dates, services and lines from `InvoiceItem` (quantity, unitPrice, taxRate, SAC), totals from stored `subtotal/taxAmount/grandTotal`, gst from stored `gstPlaceOfSupply/gstReverseCharge/gstSupplyOverride/irn*`, accent from `Invoice.accentColor`, TDS from stored `tds*`, status and `payment.paidOn/amountPaid` from live payments, payment link from the invoice's stored link when present (else none).
- `loadPreviewParams(workspaceId: string, invoiceId: string | null): Promise<{ params: PDFParams; invoice: { id: string; number: string; clientName: string; date: Date } | null; isSample: boolean } | null>` — the latest non-void invoice when `invoiceId` is null; `null` when the id is not in this workspace; falls back to a labelled sample (`SAMPLE_INVOICES.gstIntra` with the workspace's profile) when the workspace has no invoices.
- `applyPreviewOverrides(params: PDFParams, overrides: { accent?: unknown; tdsRatePercent?: unknown; tdsSection?: unknown; design: string }): PDFParams` — accent through `normalizeHexColor`; TDS through `computeTds` (clamped, export-safe); design sets `templateId`.

- [ ] **Step 1: Failing tests:** mapping from a plain row object (lines, GST kind, totals match stored, paid/partial status from payments, TDS carried, accent carried, voided/foreign cases); `applyPreviewOverrides` with hostile accent/TDS values (Review Focus 5); sample fallback shape. **Step 2–4:** FAIL, implement, PASS, `tsc`. **Step 5: Commit.**

### Task 7: Redis preview cache and render queue

**Files:** create `lib/invoice-templates/preview-cache.ts`, `lib/invoice-templates/preview-render.ts`. Tests: `tests/invoice/preview-cache.test.ts`.

**Interfaces — Produces:**
- `previewCacheKey(args: { workspaceId: string; design: string; params: PDFParams }): string` — sha256 over a stable JSON of the params (dates as ISO) plus `TEMPLATE_CACHE_VERSION` (a constant bumped when any template changes) and the design.
- `getOrRenderPreview(args: { workspaceId: string; design: string; params: PDFParams; render: () => Promise<Uint8Array> }): Promise<{ bytes: Uint8Array; state: "HIT" | "MISS" | "BYPASS" }>` — Redis (`dataCache` purpose, `cache` feature) with TTL 10 minutes and a 600 KB size cap, an in-process LRU (20 entries, 5 minutes) otherwise; single-flight per key in-process and a short Redis `SET NX PX` lock so other workers wait for the result (poll up to ~3s, then render anyway); any Redis error falls back to rendering.
- `renderPreviewPdf(params: PDFParams): Promise<Uint8Array>` — `generateInvoicePDF`, behind a semaphore of 2 concurrent renders.

- [ ] **Step 1: Failing tests (Redis layer mocked via `vi.mock("@/lib/redis/client")`):** same params → same key, different design/accent/TDS/amount → different keys; first call renders (MISS) and stores, second returns HIT without rendering; Redis disabled → in-process cache still hits; Redis `get` throwing → renders (BYPASS), no throw; oversized PDF is not stored; 8 concurrent identical calls render once; the semaphore never runs more than 2 renders at once; the lock path: a second worker (second call with the lock held and the value appearing) returns the value without rendering.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit.**

### Task 8: Preview API route

**Files:** create `app/api/invoice-designs/preview/route.ts`, `app/api/invoice-designs/meta/route.ts` (latest invoice summary + design list). Test: `tests/invoice/preview-route.test.ts` (route handler with mocked session/prisma loader).

**Behaviour:** `GET ?design=DESIGN_n&invoiceId=&accent=&tds=&tdsSection=`: 401 without a session; 400 for an unknown design; 404 when `invoiceId` is not in the workspace; rate limit (60/min per user); response `application/pdf`, `Cache-Control: private, no-store`, header `X-Preview-Cache: HIT|MISS|BYPASS`, `Content-Disposition: inline`; with `download=1` an attachment filename `invoice-<number>-<design>.pdf`.

- [ ] **Step 1–4:** failing tests (401, 400, 404 cross-workspace, 200 PDF with `%PDF` magic and the cache header, hostile accent ignored, rate limit), implement, PASS. **Step 5: Commit.**

### Task 9: Compare-all-designs page

**Files:** create `app/(dashboard)/settings/invoice-designs/page.tsx`, `_components/DesignCompare.tsx` (+ small `PdfCanvas.tsx`, `DesignViewer.tsx`), modify `Invoicing.tsx` (link "Compare all designs"), `lib/settings/nav.ts` only if a nav entry is wanted (no), messages. Verified in a browser.

**Behaviour (frontend-design bar):**
- Header: "Compare designs", the invoice being shown ("Invoice INV/26-27/001 · Acme Industries", or a "Sample invoice" badge when the workspace has none).
- Controls: accent colour (`AccentColorField`, "applies to the workspace default when you choose a design") and a "Show TDS" toggle with section/rate; changes re-render the tiles (debounced 400ms).
- Tiles in a responsive grid (1 column phone, 2 tablet, 4 desktop), true paper aspect (A4 portrait; the receipt tall and narrow), skeleton shimmer while rendering, lazy via IntersectionObserver, `pdfjs-dist` (dynamic import, first page only, device-pixel-ratio aware), current design marked, keyboard-focusable.
- Full-screen viewer (dialog): large canvas, zoom in/out (and pinch/scroll), previous/next design, "Use this design" (PATCH `/api/settings` section `invoicing` with the design and, if the user changed it, the accent colour), "Download PDF". Focus trap, Escape closes, safe areas, `pb-safe`.
- Errors per tile ("Could not render. Retry"), empty and sample states, light/dark, reduced motion.

- [ ] **Step 1:** build with the frontend-design skill. **Step 2: Browser check** at 390×844 and 1280×900 in light and dark: tiles render, accent and TDS change the previews, the viewer opens, zooms, navigates and saves a design, the receipt tile is narrow; capture the pdfjs worker setup that works under Next. **Step 3:** `npm run ci:fast`. **Step 4: Commit.**

### Task 10: Verification and PR

- [ ] Full `npm run ci:fast`; local `npm run build`; Classic/Modern baseline green; decode the UPI QR; render the stage 3 fixtures and look at them; push, update PR #686 (stage 3 section), watch CI, fix what it reports. Ledger rulings and deferred minors go in the final message.

---

## Self-Review

- **Spec coverage:** UPI ID + uploaded QRs (Tasks 1–3), Settings → Banking UI (2), onboarding optional step (5), QR priority and receipt single QR (3), comparison page with tiles, full-screen viewer, accent/TDS controls, "use this design" (9), Redis preview cache + single-flight + concurrency cap + rate limiting (7, 8), no-side-effect preview (6, 8). Stage 4 (dynamic Razorpay QR) remains.
- **Type consistency:** `InvoiceQrSource` union, `normalizeUpiVpa`, `buildUpiUri`, `toPdfPaymentQrs`, `mapInvoiceToParams`, `loadPreviewParams`, `applyPreviewOverrides`, `previewCacheKey`, `getOrRenderPreview` are named identically across tasks.
- **My calls:** the Redis cache is content-addressed (hash of the params) so no invalidation hooks are needed; it uses `lib/redis` directly with `dataCache` rather than `cachedDataSnapshot` (JSON-only, 30s TTL cap, 384 KB cap: unsuitable for PDFs); the wizard collects only the UPI ID (no bank step exists there); QR priority is link, then UPI, then images; the sidebar checklist item is skipped.
