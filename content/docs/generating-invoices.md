---
title: "Generating, Sending, and Collecting Invoices"
description: "Advanced guide to drafting invoices, delivering PDFs, avoiding duplicates, and accelerating collections with payment links."
order: 2
category: "Invoicing"
tags: ["invoice", "pdf", "email", "smtp", "numbering"]
estimatedMinutes: 10
isFeatured: true
icon: "ReceiptText"
dateModified: "2026-11-21"
---

# Generating, Sending, and Collecting Invoices

This guide covers the complete invoice lifecycle: draft, validate, generate, send, and collect.

<HelpImage src="/help/diagrams/invoice_workflow.svg" alt="Invoice lifecycle from draft to paid status" caption="Use this lifecycle as your standard invoicing process." />

<HelpImage src="/product-images/light/invoice_new.png" alt="New invoice form with the invoice colour field and the Client deducts TDS switch showing net payable" caption="Confirm the client, line items, taxes, totals, TDS and remittance details before generating the customer PDF." />

## Before you start

Ensure these prerequisites are done:

- Settings profile is complete
- Client exists in CRM
- Service line items are ready
- SMTP is configured (for email)
- Gateway is connected (optional, for payment links)

---

## Step-by-step invoice flow

<Steps>
  <Step title="Open New Invoice">
    Go to **Invoices & Earnings** and click **New Invoice**.
  </Step>
  <Step title="Select client and period">
    Choose the client and billing month/date.
  </Step>
  <Step title="Add service lines">
    Add deliverables with clear names, rates, and totals.
  </Step>
  <Step title="Review taxes and totals">
    Confirm applicable tax logic and net payable amount.
  </Step>
  <Step title="Generate PDF">
    Click **Generate Invoice**. The system assigns an invoice number and stores the PDF.
  </Step>
</Steps>

---

## Choose how the invoice looks

Your invoice uses the design set in **Settings → Invoicing**. There are eight, from a GST tax invoice to an 80mm receipt, and you can preview them all on your own invoice with **Compare all designs**. In the new invoice form you can also:

- Override the **Invoice colour** for this one invoice.
- Switch on **Client deducts TDS** so the invoice shows **Net payable** and the payment link collects that amount.

Add a UPI ID in **Settings → Bank account** and the Pay-Fast and Receipt designs show a scan-to-pay QR. See [Invoice Designs](/help/invoice-designs) for the full guide.

---

## Invoice numbering logic

Format: `INV/FY/SEQ`

Example: `INV/26-27/014`

- `26-27`: financial year
- `014`: sequence number in that year

Numbers are unique and traceable for audit.

---

## Send invoice by email

Enable **Send Invoice via Email** before generating, or re-send from invoice history later.

<Callout type="tip">
  Send a test invoice to yourself after any SMTP change.
</Callout>

---

## Accept online payments from invoice

When Stripe/Razorpay is active, PDF includes a clickable payment link. If the client deducts TDS, the link asks for the net payable amount. Pay-Fast and Receipt also show a QR from the payment link, or from your UPI ID if there is no link.

Client flow:

1. Open PDF
2. Click pay link
3. Complete payment
4. Payment updates in records (based on your workflow)

See: [Connecting Razorpay & Stripe](/help/payment-gateways)

---

## Duplicate generation protection

If an identical invoice is generated repeatedly in a short window, ERP blocks duplicate creation to protect against double-billing.

---

## Re-send, download, and recovery operations

From invoice list/dashboard:

- **Download** for offline sharing
- **Re-send** for missed client emails
- Follow collections workflow for overdue invoices

---

## Invoice quality checklist

Before sending, verify:

- Client legal details
- Tax treatment (domestic/export)
- Bank details on PDF
- Line item descriptions are specific
- Payment terms are clear
- TDS section and rate, if the client deducts tax at source
- The design and colour look right (use **Compare all designs** if unsure)

---

## Troubleshooting

| Problem | What it usually means | What to do |
|---|---|---|
| PDF not generating | Missing required fields or temporary service failure | Recheck client, date, and line items; retry once |
| Email not delivered | SMTP is not configured or credentials expired | Go to Settings and verify SMTP host/port/app password |
| Wrong tax mode on invoice | Client export/domestic flag is incorrect | Fix client tax profile in CRM and regenerate |
| No payment link in PDF | Gateway not connected or not active | Reconnect Stripe/Razorpay and generate a fresh invoice |

---

## Do / Don't

**Do**
- Keep line items specific (deliverable + period).
- Send a test invoice to yourself after major settings changes.
- Review totals and taxes before final send.

**Don't**
- Reuse vague descriptions like "Services rendered".
- Assume old invoices will auto-update after settings changes.
- Share invoice PDFs without checking remittance details.

---

## Related guides

- [Configuring Your Business Profile & Workspace Settings](/help/settings-guide)
- [Invoice Designs: Eight Layouts, Brand Colour, TDS and UPI QR](/help/invoice-designs)
- [Connecting Razorpay & Stripe](/help/payment-gateways)
- [Optional Module: AR Aging + Collections Centre](/help/optional-sub-system-ar-collections)

---

## Article details

- **Last reviewed:** 2026-11-21
- **Owner:** Finance Operations Docs
- **Audience:** Founders, Finance Ops, Billing Managers

## Need help?

Email **admin@bababuilds.com** with invoice number and issue summary.

---

## FAQ

### Can I edit a generated invoice PDF directly?
No. Update invoice data in ERP and generate a new version to keep records clean.

### Why is my invoice number not sequential to last month?
Numbering follows financial-year sequence and integrity controls, not just monthly grouping.

### Can I resend an invoice without regenerating?
Yes. Use the re-send action from invoice history where available.
