# CA Compliance (`/ca-portal`)

The place where an owner and their accountant take a financial year from "books exist" to "filed and signed off".

## What is derived, what is stored
- **Derived** (always current, nothing to sync): the obligation list and due dates (`lib/ca/calendar.ts`, rules in `lib/ca/rules.ts`),
  GST returns (read from the GST workspace, never tracked twice), books readiness (`lib/ca/readiness.ts` + `lib/ca/data.ts`),
  year figures, the income-tax estimate and the presumptive/registration hints.
- **Stored**: only what a person set. `CaComplianceItem` (status, owner, filing reference, extended due date, notes, sign-off),
  `CaRequest` / `CaRequestMessage` (document requests and queries) and the entity setup on `BusinessProfile.ca*`.

## Rules worth knowing
- Obligations before the business started deducting tax or running payroll are not listed (no invented overdue items).
- A sign-off means something: only a filed obligation can be signed off, the year only when nothing blocks closing the books and
  nothing is overdue, and changing a signed item's outcome clears the sign-off.
- Warnings never block the close; blockers do. Overdue receivables are informational.
- GST returns are filed in the GST workspace; here you can assign an owner, add notes and sign off.

## Permissions
`ca.view`, `ca.manage` (calendar and setup), `ca.request` (requests and replies), `ca.signoff`, `ca.export`.
OWNER/ADMIN: all. FINANCE_MANAGER: all but sign-off. ACCOUNTANT: view, request, sign-off, export (not manage).
Exports require `ca.export`, are rate limited and every download is written to the activity log (`CA_EXPORT_*`).

## Replaces
`/api/ca-portal/*` (whose exports only checked for a session), `/tax/hub` and `/tax/advanced` (both now redirect here).
The tax-obligation cron and its models are untouched.

## Verify before relying on it
Due dates and thresholds come from public tax and company-law sources (`lib/ca/rules.ts`). FY 2026-27 is the first year under the
Income-tax Act 2025, which keeps these dates. Record any notified extension on the item.
