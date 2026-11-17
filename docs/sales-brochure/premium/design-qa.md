# Design QA — Command After Dark brochure

**Source visual truth:** `/workspace/generated_images/exec-d66f04e5-a299-4747-8ee8-e01b63cc0a22.png`

**Implementation:** `docs/sales-brochure/premium/index.html`

**Implementation screenshot:** `docs/sales-brochure/premium/dist/cover-preview.png`

**Combined comparison:** `docs/sales-brochure/premium/dist/design-comparison.png`

**Full brochure evidence:** `docs/sales-brochure/premium/dist/contact-sheet.png`

**Viewport:** 1120 × 1584 CSS px, device scale factor 1

**Source pixels:** 1024 × 1536

**Implementation cover pixels:** 1120 × 1584

**Density normalization:** both source and implementation were proportionally reduced to a maximum 540 × 810 px inside the combined comparison; no browser chrome was included.

**State:** static brochure, default desktop/print state

## Findings

No actionable P0, P1, or P2 differences remain.

- **Fonts and typography:** The implementation preserves the source's heavy neo-grotesk hierarchy, tight display spacing, white/orange emphasis, compact eyebrow, and readable supporting copy. The implementation uses locally available Arial/Helvetica fallbacks to keep browser and PDF output deterministic.
- **Spacing and layout rhythm:** The cover retains the source sequence—brand, promise, supporting statement, layered product evidence, and CTA—with more negative space around the real screenshots. All ten A4 pages have consistent 15 mm content margins, section numbering, and footers.
- **Colors and visual tokens:** Near-black and graphite surfaces, #f45b00 orange, white type, restrained green status color, and subtle copper lighting match the selected direction. Contrast remains strong throughout.
- **Image quality and asset fidelity:** The final brochure uses the original captured application screenshots rather than regenerated UI. All 21 raster assets loaded at native resolution; no placeholders or CSS-drawn illustrations remain. Custom decorative assets share the selected art direction.
- **Copy and content:** The narrative focuses on operational pain, revenue-to-cash continuity, cleaner books, and gradual adoption. It avoids fabricated metrics, customer claims, awards, or compliance guarantees. Demo-data and configuration caveats are disclosed.

## Full-view evidence

The combined cover comparison confirms the implementation matches the selected visual direction while improving product accuracy with unaltered screenshots. The ten-page contact sheet confirms consistent pacing and page hierarchy across problem, command center, revenue, cash, compliance, operations, journey, fit, and CTA pages.

## Focused-region evidence

Separate focused crops were not required: the cover comparison renders the brand, headline, screenshots, and CTA legibly, while the 90-DPI PDF contact sheet is sufficient to verify page-level rhythm. Original screenshots were also inspected directly during source capture and remain unchanged in the brochure.

## Browser and interaction verification

- Rendered in Chromium 156 at 1120 × 1584.
- Confirmed 10 `.page` elements.
- Confirmed 21 images with zero broken assets.
- Confirmed two primary CTA links resolve to `https://erp.bababuilds.com/`.
- Confirmed zero browser console errors after adding the brochure favicon.
- The shared cloud-browser relay was unavailable (`gaas-browser node_repl sandbox cannot be disabled`), so the identical static build was verified in the workspace's installed Chromium through Playwright.

## PDF verification

- 10 pages.
- A4 page size: 594.96 × 841.92 points.
- Background graphics enabled.
- No encryption, JavaScript, forms, or missing images.
- Final file: `docs/sales-brochure/premium/dist/bababuilds-erp-command-after-dark.pdf`.

## Comparison history

### Pass 1

- Finding: one browser console 404 caused by the missing favicon.
- Severity: P2 polish/quality issue.
- Fix: added the generated BabaBuilds mark as an explicit favicon.
- Post-fix evidence: Chromium reported zero console errors; brochure and PDF were re-rendered.

## Follow-up polish

- P3: Replace `hello@bababuilds.com` if sales uses a different monitored address.
- P3: Add a QR code only when a stable campaign URL and analytics destination are available.

**final result: passed**
