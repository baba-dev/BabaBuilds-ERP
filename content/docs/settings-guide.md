---
title: "Configuring Your Business Profile"
description: "A complete guide to every section in Settings — from company identity and banking to SMTP email, AI keys, and invoice themes."
order: 8
---

# Configuring Your Business Profile

**Settings** is your ERP's master control panel. Everything configured here appears on your invoices and powers the ERP's features.

Navigate to **Settings** in the sidebar.

---

## Identity & Branding

| Field | Used On |
|---|---|
| **Company Name** | All invoice headers |
| **Proprietor Name** | Authorized signatory line |
| **Full Address** | Invoice "From" section |
| **Contact Email** | Invoice footer & email sender |
| **Phone / Website** | Invoice footer |
| **Logo** | Top of every invoice PDF (PNG recommended) |

---

## Invoice Theme

Choose your invoice design:

- **Design 1 — Classic**: Traditional black-footer layout with statutory declarations. Ideal for Indian domestic clients.
- **Design 2 — Modern Agency**: Clean, minimal layout similar to Stripe invoices. Great for international clients.

---

## Language

Select your preferred language for the ERP interface:

- 🇬🇧 English (India) — default
- 🇸🇦 Arabic
- 🇪🇸 Spanish
- 🇮🇳 Hindi

---

## Compliance & Tax

| Field | Description |
|---|---|
| **PAN Number** | Primary compliance identifier field (commonly PAN for India, can map to local business/tax ID in other regions) |
| **Udyam Registration** | Secondary business registration field (India MSME or local registration reference) |
| **GSTIN** | Tax registration field (GSTIN/TRN/VAT number, depending on country setup) |
| **Default SAC/HSN Code** | Fallback service classification code if none specified per invoice |

---

## Banking Details

These appear in the **"Bank Details for Remittance"** section of every invoice:

| Field | Description |
|---|---|
| **Bank Name** | Your bank (e.g., ICICI Bank) |
| **Account Name** | Name on the account |
| **Account Number** | Stored securely, visible only on invoices |
| **IFSC Code** | Routing identifier field (IFSC / IBAN / SWIFT based on your country setup) |

---

## Email Server (SMTP)

Configure SMTP to enable invoice email delivery:

| Field | Example |
|---|---|
| **SMTP Host** | `smtp.gmail.com` |
| **SMTP Port** | `465` (SSL) or `587` (TLS) |
| **SMTP Username** | Your email address |
| **SMTP Password** | App password (not your login password) |
| **From Email** | `billing@yourcompany.com` |

> **Gmail users:** Enable 2FA on your Google account and generate an [App Password](https://myaccount.google.com/apppasswords) to use here.

---

## AI Assistant (Groq API Key)

Enter your **Groq API key** here to enable BabaBot. Get a free key at [console.groq.com](https://console.groq.com).

To remove an existing key, click the **🗑 Delete** icon. BabaBot will stop working until a new key is added.

---

## Payment Gateway

Connect **Razorpay** (INR / India) or **Stripe** (global) to embed payment links in invoices.

See the full guide: [Connecting Razorpay & Stripe](/help/payment-gateways)

---

## Saving Your Settings

Click the **Save Configuration** button at the bottom of the page. Settings are applied immediately, and the page will refresh to apply any language changes.

---

## Questions?

Our team is available at **admin@bababuilds.com** for any settings or configuration help.
