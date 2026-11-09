# Small-business rules (Udyam, GST threshold, MSME)

Not every Indian business needs GST. A sole proprietor below the registration limit can trade without a GSTIN and still register on Udyam. This module makes the ERP behave correctly for them. All figures live in `lib/msme/rules.ts`.

## What the app does

| Area | Behaviour |
|---|---|
| Invoices, retainers, proposals, POS | When the workspace is set to **Unregistered** or **Composition**, no GST is charged. The PDF says `INVOICE` / "supplier not registered under GST", or `BILL OF SUPPLY` for composition dealers. Exports keep their own title. |
| `/tax` overview | For unregistered businesses the page shows the **Small business status** panel: turnover this FY against the limit, projected crossing date, the 30-day registration deadline once crossed, Udyam, MSME class and composition eligibility. Registered businesses see the same panel above the returns. |
| GST setup | New fields: what you sell (services, goods or both, which picks the limit) and investment in plant and equipment (for MSME class). |
| Settings | The Udyam number is validated (`UDYAM-MH-12-0000001`) and stored normalised. |
| Expenses | Tag a supplier micro / small / medium, with Udyam number and agreed credit days. A no-GST bill can now be marked "pay later". |
| CA Compliance | Purchases readiness warns about unpaid bills to micro and small suppliers past the allowed days (section 43B(h)). The GST-registration hint uses the right limit for goods or services and special-category states. |

## Rules used (verify before relying on them)

- GST registration: services 20 lakh, goods 40 lakh, special-category states (Manipur, Mizoram, Nagaland, Tripura) 10 lakh / 20 lakh. A business selling both uses the services limit. Apply within 30 days of crossing; tax is charged from the crossing date.
- Even below the limit, inter-state sale of goods and sales through e-commerce operators can require registration. The panel says so; the app does not try to decide it.
- Composition: services up to 50 lakh at 6%, goods up to 1.5 crore at 1%, intra-state only.
- MSME classification (from 1 April 2025): micro up to 2.5 crore investment and 10 crore turnover; small 25 crore and 100 crore; medium 125 crore and 500 crore. Both tests must fit.
- Section 43B(h): payments to micro and small suppliers must be made within the agreed period, at most 45 days (15 days without a written agreement). Amounts unpaid at year end beyond that are disallowed for the year and deducted when paid. Traders and medium enterprises are outside the rule.

## Limits of the build

- Aggregate turnover is taken from this FY's non-void invoices (GST-exclusive, converted at the stored exchange rate). Exempt and export supplies count, which matches the law, but the app cannot see sales made outside it.
- The Udyam number is checked for format only. There is no live lookup on the Udyam portal.
- MSME status of a supplier is what the user ticks; the app does not verify it.
- Rates and limits come from public sources. A notification change is a one-file edit.
