# Expenses

Beyond the ledger, the Expenses module has vendors, approvals, recurring schedules, budgets, a bill inbox, bank matching and billable expenses. This page lists what needs setting up outside the app.

## Daily job (needs scheduling on the server)
`GET /api/cron/expense-automation` with `Authorization: Bearer $CRON_SECRET`, like the other cron routes. It posts recurring expenses that have come due and sends each workspace one "bills to pay" digest. Without it, people can still press **Post due now** on the Recurring tab.

## Bill inbox
Rules > Bill inbox gives a secret webhook address. Point the inbound-mail webhook of your provider (Postmark, Mailgun, SendGrid or any forwarder that can POST JSON or a form) at it. Each good attachment (image or PDF) becomes a **draft** under Review; drafts never count until approved. The token in the URL is the only credential: rotate it from Rules if it leaks. Reading bills uses the workspace's Groq key (Business Settings); without a key the draft is created with no amount to fill in. Set `GROQ_VISION_MODEL` / `GROQ_TEXT_MODEL` to change the models.

## Rules worth knowing
- **Approvals** are off by default. When on, entries from people without `expenses.approve` at or above the threshold wait as PENDING and are left out of reports, tax, GST, the dashboard and the CA pack until approved.
- **Bills on credit** get a due date: the bill's own, else the legal limit for micro and small suppliers (agreed days, at most 45; 15 with no agreement), else the vendor's terms, else 30 days. Unpaid bills appear in the cash-flow forecast on that date.
- **Paying a bill**: *Mark paid*, or match the bank debit (Reconciliation or the bank icon on the ledger row). Matching stamps the bank date as the payment date.
- **Purchase orders** with payment terms create their bill as unpaid with the due date; without terms the bill is recorded as paid, as before.
- **Billable expenses** are added to a client's invoice from the invoice composer. The amount is the cost without claimable input credit, plus the markup. They are marked billed with the invoice and then locked.
- **TDS suggestions** on the form are a starting point (typical section and rate by category); confirm with your CA.
