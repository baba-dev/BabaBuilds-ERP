# GST (India) workspace

The `/tax` page prepares GST returns from the invoices, credit notes and purchase bills already in the ERP. Return
periods and tax splits are derived on demand; only filings, adjustments, notes and comments are stored.

## What it covers
GSTR-1 (incl. SEZ, amendments, debit notes, advances, e-commerce), GSTR-3B (statutory ITC utilisation, carried-forward
credit ledger, TDS/TCS set-off), GSTR-9 tables 4-9, 17-19 and a 9C-style reconciliation, GSTR-2B matching, e-invoice
and e-way bill JSON, Tally XML, accountant ZIP bundle, reminders.

GSTR-2 and GSTR-3 were never launched by GSTN. Purchases are seen read-only in GSTR-2A/2B and GSTR-3B replaced GSTR-3.

## GST at the source
Treatment is decided where the sale is typed, not rebuilt at return time (`lib/gst/source.ts`).
- `POST /api/gst/preview` resolves place of supply and the CGST/SGST/IGST split live for the invoice, proposal and retainer
  composers (`components/gst/GstPreviewCard.tsx`), with warnings for a missing customer state, missing/invalid SAC/HSN,
  the removed 12%/28% slabs, exports, SEZ and reverse charge.
- A customer's standing treatment (`Client.gstSupplyOverride`, `Client.gstReverseCharge`) is copied onto each new invoice by
  `snapshotGstFields`: invoice generation, proposal conversion, retainer billing and POS. A SEZ customer stays SEZ on every
  recurring invoice; changing the client later does not rewrite old invoices.
- Product master carries `hsnCode` and `gstRate`. Invoice lines for a product use them, and a product line counts as goods
  for e-way bills (instead of guessing from the HSN prefix).
- POS counter sales to an anonymous domestic buyer are placed in the supplier's state (`counterSalePlace`).
- Receiving a purchase order with "log expense" books one bill per GST rate with the supplier GSTIN, invoice number, HSN
  and the CGST/SGST or IGST split, so input credit is not re-keyed.
- `POST /api/gst/gstin-lookup` is the seam for an "is this customer registered?" check. No GSP is connected, so it answers
  `501 GSP_NOT_CONFIGURED`; implement `GspProvider` in `lib/gst/gsp.ts` to switch it on.
- The public shop captures the buyer's delivery state and optional GSTIN on `ShopOrder`. The shop does not create an
  ERP invoice yet, so those fields are ready for when it does.

## Rules live in two files
- `lib/gst/rules.ts`: thresholds, late-fee caps, interest rates.
- `lib/gst/calendar.ts`: due dates (monthly, QRMP, composition, annual).
Both come from compliance sources, not the portal; verify before relying on them. Extensions are recorded per return.

## Operations
- Reminders: schedule `GET /api/cron/gst-reminders` daily with `Authorization: Bearer $CRON_SECRET`
  (7/3/1 days before and on the due date, weekly once overdue, Monday digest). Duplicates are suppressed by `GstReminderLog`.
- Cash-flow: GSTR-3B cash payable appears in the forecast as `TAX` outflows (`lib/gst/insights.ts`).
- Permissions: `tax.view` reads and comments, `tax.manage` edits setup/adjustments/documents, `tax.approve` signs off a
  review, `tax.file` records a filing. Every change is written to the activity log (`GST_*` actions).

## Income tax
`lib/tax/india-income-tax.ts` holds slabs, surcharge, rebate and the advance-tax schedule for FY 2024-25 to 2026-27
(2026-27 carries forward the 2025-26 slabs; confirm each Finance Act).
