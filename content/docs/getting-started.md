---
title: "Getting Started with BabaBuilds ERP"
description: "Set up a workspace, add the records you reuse, and send your first invoice without unnecessary configuration."
order: 1
category: "Getting Started"
tags: ["onboarding", "setup", "workspace", "first invoice", "demo"]
estimatedMinutes: 8
isFeatured: true
icon: "Rocket"
dateModified: "2026-11-17"
---

# Getting Started with BabaBuilds ERP

You do not need to configure the whole ERP before doing useful work. Start with the details that appear on customer documents, add the client and services you use most often, then create a real invoice draft. You can enable specialist modules when your process is ready for them.

## Explore safely first

If you are still evaluating BabaBuilds, open **Sign in → Explore a live demo workspace** and choose the business profile closest to your work. The demo creates an expiring workspace filled with synthetic records. Try actions freely; nothing in it belongs to a real customer.

<HelpImage src="/product-images/light/dashboard.png" alt="BabaBuilds ERP demo dashboard with the main navigation visible" caption="The demo uses the same navigation and workflows as a real workspace, with safe sample data." />

When you are ready to use your own business data, return to sign in and create or join the correct permanent workspace. Demo data is intentionally isolated and is not promoted into a live business automatically.

## 1. Confirm the workspace

Before entering data, check the company name in the workspace switcher. If you work across several companies, this prevents a client, invoice, or expense from being saved under the wrong entity.

Then open **Settings** and add the minimum details needed for a professional document:

- Legal or trading name
- Business address and contact details
- Tax registration details that apply to you
- Primary bank or remittance details
- Logo and document preferences

Save each section before moving on. Payment gateways, outbound email, storefront settings, and advanced tax options can wait until you need them.

## 2. Add reusable records

Create one real client in **Client CRM**, then add the services or products you regularly sell in **Service Catalog**. Good master data makes every later proposal and invoice faster and more consistent.

For a client, include:

1. The billing name and a working contact method.
2. The correct billing and tax address.
3. Tax identifiers only when they are required for your documents.
4. Any internal note that helps your team serve the account.

For a service, use a plain-language name, a clear unit or billing basis, and the rate your team is allowed to quote.

## 3. Create the first invoice

1. Open **Invoices & Earnings**.
2. Select **New Invoice**.
3. Choose the client and confirm the billing details pulled into the draft.
4. Add service or product lines, quantities, rates, discounts, and taxes.
5. Review the total and payment instructions before generating the PDF.
6. Save the draft. Send it only after the PDF looks correct.

Use [Generating, Sending, and Collecting Invoices](/help/generating-invoices) for the complete invoice workflow.

## 4. Record the first payment correctly

When money arrives, record it against the invoice rather than creating a separate income entry. This updates the outstanding balance and keeps receivables, reporting, and reconciliation aligned.

If you accept online payments, configure the gateway in Settings and test with a low-risk internal invoice before sharing payment links with customers.

## 5. Add modules when the workflow needs them

Open **Settings → Workspace Modules** and enable only the capabilities your team will actively own. A sensible rollout is:

1. **Documents** for shared evidence and compliance files.
2. **Cash Flow** and **Reporting** when your base invoice and expense data is reliable.
3. **Workforce** before **Payroll**, so people, attendance, leave, and payroll setup agree.
4. **Import Manager** when you have a reviewed source file and know who will resolve validation errors.

See [Optional Sub Systems — Overview](/help/optional-sub-systems-overview) before enabling a module for a larger team.

## A practical first-week checklist

- [ ] Confirmed the correct company and workspace
- [ ] Completed the business profile and remittance details
- [ ] Added at least one client and three reusable services
- [ ] Generated and reviewed a test invoice PDF
- [ ] Recorded a test payment against its invoice
- [ ] Invited teammates with the smallest roles they need
- [ ] Enabled only the modules with a named owner

## If something does not look right

- **You returned to sign in:** make sure the address you opened matches the configured `NEXTAUTH_URL`, then sign in again.
- **A menu item is missing:** the module may be disabled, your plan may not include it, or your role may not have permission.
- **The invoice total is unexpected:** review quantity, rate, discount, tax treatment, and currency before changing client or business settings.
- **Email did not send:** the invoice may still be saved correctly. Check outbound email settings and retry from the saved record instead of rebuilding it.

If you contact support, include the page name, what you selected, what you expected, and a screenshot with private customer details hidden.
