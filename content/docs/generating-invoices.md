---
title: "Generating, Sending, and Collecting Invoices"
description: "Advanced guide to drafting invoices, delivering PDFs, avoiding duplicates, and accelerating collections with payment links."
order: 2
category: "Invoicing"
tags: ["invoice", "pdf", "email", "smtp", "numbering"]
estimatedMinutes: 10
isFeatured: true
icon: "ReceiptText"
---

# Generating, Sending, and Collecting Invoices

This guide covers the complete invoice lifecycle: draft, validate, generate, send, and collect.

<HelpImage src="/help/diagrams/invoice_workflow.svg" alt="Invoice lifecycle from draft to paid status" caption="Use this lifecycle as your standard invoicing process." />

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

When Stripe/Razorpay is active, PDF includes a clickable payment link.

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

---

## Need help?

Email **admin@bababuilds.com** with invoice number and issue summary.
