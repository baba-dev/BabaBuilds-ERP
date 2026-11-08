# GST (India) workspace

The `/tax` page prepares GST returns from the invoices, credit notes and purchase bills already in the ERP. Return
periods and tax splits are derived on demand; only filings, adjustments, notes and comments are stored.

## What it covers
GSTR-1 (incl. SEZ, amendments, debit notes, advances, e-commerce), GSTR-3B (statutory ITC utilisation, carried-forward
credit ledger, TDS/TCS set-off), GSTR-9 tables 4-9, 17-19 and a 9C-style reconciliation, GSTR-2B matching, e-invoice
and e-way bill JSON, Tally XML, accountant ZIP bundle, reminders.

GSTR-2 and GSTR-3 were never launched by GSTN. Purchases are seen read-only in GSTR-2A/2B and GSTR-3B replaced GSTR-3.

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
