# BabaBuilds ERP — Command After Dark sales brochure

A conversion-focused, ten-page A4 brochure built around the real BabaBuilds ERP product screens.

## Deliverables

- Editable source: [`index.html`](index.html) and [`premium.css`](premium.css)
- Print-ready PDF: [`dist/bababuilds-erp-command-after-dark.pdf`](dist/bababuilds-erp-command-after-dark.pdf)
- Cover preview: [`dist/cover-preview.png`](dist/cover-preview.png)
- Ten-page contact sheet: [`dist/contact-sheet.png`](dist/contact-sheet.png)
- Design QA: [`design-qa.md`](design-qa.md)

## Sales strategy

The brochure follows a buyer-oriented narrative instead of presenting a feature inventory:

1. Make the cost of disconnected tools visible.
2. Establish a single business command center.
3. Show the proposal-to-revenue workflow.
4. Connect collections, cash flow, and reconciliation.
5. Reduce month-end and advisor handoff friction.
6. Demonstrate expansion into inventory, workforce, payroll, and storefront.
7. Close with a practical adoption path and interactive-demo CTA.

The copy deliberately avoids invented metrics, customer claims, awards, and compliance guarantees.

## Rebuild

From the repository root:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run brochure:premium
```

The renderer checks for exactly ten pages and rejects missing images before writing the PDF.
