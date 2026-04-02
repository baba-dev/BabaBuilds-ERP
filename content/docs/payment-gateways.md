---
title: "Connecting Razorpay & Stripe"
description: "PRO feature: How to connect your payment gateway and start collecting online payments directly from your invoice PDFs."
order: 5
---

# Connecting Razorpay & Stripe

> **This is a PRO feature.** Upgrade your plan to enable payment gateway integration.

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

1. Log in to your [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Go to **Settings → API Keys → Generate Key**
3. Copy your **Key ID** and **Key Secret**
4. In BabaBuilds ERP, go to **Settings → Payment Gateway**
5. Select the **Razorpay** tab
6. Enter your **Key ID** and **Key Secret**
7. Click **Save Configuration**

Your Key Secret is encrypted with **AES-256-GCM** before storage and is never visible again after saving. Only the last 4 characters of the Key ID are shown.

---

## Connecting Stripe (Global Users)

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com/)
2. Go to **Developers → API Keys**
3. Copy your **Publishable Key** (starts with `pk_live_`) and **Secret Key** (starts with `sk_live_`)
4. In BabaBuilds ERP, go to **Settings → Payment Gateway**
5. Select the **Stripe** tab
6. Enter both keys
7. Click **Save Configuration**

---

## Setting Your Default Gateway

In **Settings → Payment Gateway**, use the **Default Gateway** selector to choose which gateway generates links on new invoices. Only one gateway is active at a time.

---

## How Payment Links Appear in Invoices

After connecting a gateway, every new invoice PDF will contain a line like:

> `Pay securely online: https://rzp.io/i/xxxxxx`

This text is a real, clickable hyperlink in PDF viewers. Clients can click it to pay instantly.

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
