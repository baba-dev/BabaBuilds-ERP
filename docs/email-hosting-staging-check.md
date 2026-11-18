# Email Hosting: staging check for accrual billing

Run this before turning accrual billing on for real clients, and again after any change to
`lib/email-billing/{accrual,collections}.ts`. Everything runs on a **disposable** PostgreSQL 17 database named
`bababuilds_erp_ci` on localhost. The seed script and the integration test both refuse anything else.

## 1. Automated check (about a minute)

```bash
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci
npx prisma migrate deploy
npm run check:migrations
CI_POSTGRES_FINANCE_TESTS=1 npx vitest run tests/integration/postgres-email-accrual.test.ts
```

The test uses the real invoice engine (numbering, tax, PDF, payments, void) with no mocks. It proves that:

- a statement is the sum of whole months plus exact days per address, and matches what the invoice charges;
- a collection creates one invoice, moves every address's paid-up-to date, and a second collection charges only what is new;
- five simultaneous collects create exactly one invoice;
- a changed amount is refused (`AMOUNT_CHANGED`) instead of invoicing a surprise total;
- undo works only for the latest unpaid collection, restores the days, and the days can be collected again exactly once;
- a failed invoice restores the dates; an interrupted collection is recovered without a second invoice;
- the daily job in accrual mode takes snapshots and never creates a retainer;
- another workspace's data is never touched.

## 2. Realistic data (to look at the screens)

1. Start the app with a demo key: `DEMO_AGENT_KEY=<random> npm run dev`.
2. Create a demo workspace: `POST /api/auth/demo` with header `x-demo-agent-key` and body `{"templateKey":"dm_agency"}`; sign in as described in `docs/demo-account-dev-agent-access.md`.
3. Seed it:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci \
NODE_OPTIONS=--conditions=react-server npx tsx scripts/email-hosting-staging-seed.ts --workspace=<workspaceId>
```

The seed creates 14 domains for 12 billed clients, 2 unbilled domains, near-full, suspended and removed
mailboxes, one client collected and paid, and one collected and unpaid. It prints the expected statement totals.

## 3. Manual walkthrough (what to look at)

| Step | Where | Expect |
|---|---|---|
| Dashboard | Email Hosting | "Ready to collect" equals the sum on Balances; attention list shows unbilled domains, full mailboxes, unpaid invoice |
| Pick a client | Balances > client | Per-address rows: From, Through, Months, Amount. Recompute one row by hand: whole months x price + leftover days / days in that month x price, rounded to cents |
| Change the date | Statement "Up to and including" | Amounts change; the total equals the sum of the rows |
| Set an opening date | "Set start or paid-up-to dates" | Only moves forward; earlier dates are refused |
| Collect, money received | Collect button | One invoice, tax per your settings, invoice number in sequence, PDF opens, payment recorded |
| Collect again the same day | Statement | Nothing owed |
| Collect later | Next month | Only the new days are charged |
| Undo | Collections list | Latest unpaid collection can be undone (credit note); a paid one cannot |
| Interrupted collection | Attention list | Shows "interrupted"; Review recovers it without a second invoice |

## 4. Known assumptions to confirm with the accountant

- Prices are before tax; tax is added on the invoice at collection.
- The day of collection is charged (the period includes both ends).
- Invoices are issued only in the workspace base currency.
- Quota and outbound limits above the base are not charged separately.

## Cleanup

Stop the dev server and drop the disposable database. Nothing from this check touches production.
