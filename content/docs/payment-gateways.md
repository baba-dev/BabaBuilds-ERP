---
title: "Connecting Razorpay & Stripe"
description: "PRO feature: How to connect your payment gateway and start collecting online payments directly from your invoice PDFs."
order: 5
category: "Payments"
tags:
  - "Stripe"
  - "Razorpay"
  - "Payments"
  - "Invoice payments"
icon: "CreditCard"
estimatedMinutes: 8
isFeatured: true
---

# Connecting Razorpay & Stripe

<Callout type="warn">This is a PRO feature. Upgrade your plan to enable payment gateway integration.</Callout>

Once connected, BabaBuilds ERP automatically embeds a **clickable payment link** in every invoice PDF you generate. Your clients can pay directly from the PDF — no extra steps.

---

## Which Gateway Should I Use?

| Gateway | Best For | Currency |
|---|---|---|
| **Razorpay** 🇮🇳 | Indian businesses billing in INR | INR only |
| **Stripe** 🌐 | Global businesses, international clients | 135+ currencies |

> If you are Indian and mostly bill domestic clients, use **Razorpay**. If you bill internationally or receive USD/EUR, use **Stripe**.

---

## Connecting Razorpay (Indian Users)

<Steps>
  <Step title="Get your Razorpay API keys">
    1. Log in to your [Razorpay Dashboard](https://dashboard.razorpay.com/)\n    2. Go to **Settings → API Keys → Generate Key**\n    3. Copy your **Key ID** and **Key Secret**
  </Step>
  <Step title="Connect Razorpay inside BabaBuilds ERP">
    1. Go to **Settings → Payment Gateway**\n    2. Select the **Razorpay** tab\n    3. Enter your **Key ID** and **Key Secret**\n    4. Click **Save Configuration**
  </Step>
  <Step title="Verify the result">
    Generate a test invoice and confirm a **Pay securely online** link appears in the PDF.
  </Step>
</Steps>

Your Key Secret is encrypted with **AES-256-GCM** before storage and is never visible again after saving. Only the last 4 characters of the Key ID are shown.

---

## Connecting Stripe (Global Users)

<Steps>
  <Step title="Get your Stripe API keys">
    1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)\n    2. Go to **Developers → API Keys**\n    3. Copy your **Publishable Key** (starts with `pk_`) and **Secret Key** (starts with `sk_`)
  </Step>
  <Step title="Connect Stripe inside BabaBuilds ERP">
    1. Go to **Settings → Payment Gateway**\n    2. Select the **Stripe** tab\n    3. Enter both keys\n    4. Click **Save Configuration**
  </Step>
  <Step title="Verify the result">
    Generate a test invoice and confirm a payment link appears in the PDF.\n\n    <Callout type="tip">Use test keys in a non-production Stripe account first.</Callout>
  </Step>
</Steps>

---

## Setting Your Default Gateway

In **Settings → Payment Gateway**, use the **Default Gateway** selector to choose which gateway generates links on new invoices. Only one gateway is active at a time.

---

## How Payment Links Appear in Invoices

After connecting a gateway, every new invoice PDF will contain a line like:

> `Pay securely online: https://rzp.io/i/xxxxxx`

This text is a real, clickable hyperlink in PDF viewers. Clients can click it to pay instantly.

<HelpImage src="/help/diagrams/invoice_workflow.svg" alt="Invoice workflow diagram" caption="Invoice workflow: draft → generate PDF → send → get paid → reconcile." />

---

## Rotating or Removing Keys

On the Gateway settings panel:

- Click **Change** to replace your current secret key
- Click the **🗑 Delete** button to instantly revoke and remove the stored key

After deletion, new invoices will be generated without payment links until you reconnect.

---

## Currency Restrictions

- **Razorpay** only works when your workspace base currency is **INR**. If you are a non-Indian agency, Razorpay will be disabled automatically.
- **Stripe** works with any currency supported by your Stripe account.

---

## Need Help?

Contact our team at **admin@bababuilds.com** for gateway configuration support.
