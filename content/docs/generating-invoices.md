---
title: "Generating & Sending Invoices"
description: "Step-by-step guide to creating professional tax invoices, sending them by email, and downloading PDFs."
order: 2
---

# Generating & Sending Invoices

BabaBuilds ERP generates legally compliant **Tax Invoices** (or **Export of Services** invoices for international clients) as beautifully formatted PDFs.

---

## Before You Begin

Make sure you have:

- Completed your **Business Profile** (Settings → Business Profile)
- Added at least one **Client** (Client CRM)
- Added your **Services** to the catalog (Service Catalog)

---

## Step 1: Open the Invoice Generator

Click **New Invoice** in the left sidebar.

---

## Step 2: Fill In the Invoice Details

| Field | Description |
|---|---|
| **Select Client** | Choose a client from your CRM |
| **Billing Month** | The period this invoice covers (e.g., "March 2025") |
| **Invoice Date** | Defaults to today; can be customised |
| **SAC/HSN Code** | Service classification code (defaults to your profile setting) |
| **Services** | Add one or more line items with name and amount |

---

## Step 3: Choose Your Invoice Design

Two designs are available (configurable in **Settings**):

- **Design 1 — Classic**: Traditional layout with a black footer banner and statutory declarations. Best for Indian domestic clients.
- **Design 2 — Modern Agency**: Minimal, Stripe-inspired layout. Great for international billing.

---

## Step 4: Generate the Invoice

Click **Generate Invoice**. The system will:

1. Assign a sequential invoice number (e.g., `INV/25-26/001`)
2. Generate the PDF and save it to your workspace
3. Embed a clickable **payment link** (if you have Razorpay or Stripe connected — PRO only)
4. Save the record to your ledger

---

## Step 5: Email the Invoice

Enable the **Send Invoice via Email** toggle before clicking Generate. The invoice PDF will be attached and sent to your client's email address using your configured SMTP server.

> **Tip:** Configure your SMTP settings in **Settings → Email Server** to enable this feature.

---

## Duplicate Protection

If you click Generate twice within 60 seconds for an identical invoice, the system will detect it and block the second request to prevent duplicate billing.

---

## Downloading & Re-sending

From the **Dashboard** or **Ledger**, click the **Download** icon (⬇) to get the PDF. Click the **Send** icon (✈) to re-send the invoice email to your client.

---

## Invoice Numbering

Invoice numbers follow this format: `INV/FY/SEQ`

Example: `INV/25-26/007` → Invoice #7 in Financial Year 2025–26.

---

## Questions?

Reach out to **admin@bababuilds.com** for billing-related support.
