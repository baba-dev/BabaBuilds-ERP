---
title: "Connecting Razorpay & Stripe"
description: "Set up payment gateways, validate keys, and ensure every invoice includes actionable online payment links."
order: 5
category: "Payments"
tags: ["Stripe", "Razorpay", "Payments", "Invoice payments", "gateway"]
icon: "CreditCard"
estimatedMinutes: 9
isFeatured: true
dateModified: "2026-04-21"
---

# Connecting Razorpay & Stripe

Enable online collections by connecting your payment gateway in Settings.

<Callout type="warn">Gateway integration is available on eligible plans.</Callout>

## Choose the right gateway

| Gateway | Best for | Currency profile |
|---|---|---|
| **Razorpay** | India-first billing | INR-centric |
| **Stripe** | Global businesses | Multi-currency |

---

## Setup path in ERP

1. Open **Settings**
2. Go to **Payment Gateway**
3. Select Razorpay or Stripe tab
4. Paste credentials
5. Save configuration

---

## Razorpay setup

- Get Key ID + Secret from Razorpay dashboard
- Paste in ERP and save
- Generate test invoice and verify payment link

## Stripe setup

- Get Publishable + Secret keys
- Paste in ERP and save
- Generate test invoice and verify payment link

<Callout type="tip">
  Use test keys first, then switch to live keys once your team confirms end-to-end behavior.
</Callout>

---

## Security and key handling

- Secrets are encrypted at rest
- Full secret is not shown after save
- Rotate keys periodically
- Remove keys immediately if compromised

---

## Verify payment-link output in invoice PDF

Expected behavior:

- Invoice PDF contains clear call to action
- Link opens gateway checkout page
- Transaction is traceable in your own gateway console

<HelpImage src="/help/diagrams/payments_flow.svg" alt="Flow of invoice payment through connected gateway" caption="Connected gateways close the loop from invoice delivery to collections." />

---

## Troubleshooting quick map

| Symptom | Likely cause | Action |
|---|---|---|
| No pay link in PDF | Gateway not active | Recheck Settings and save |
| Payment fails on checkout | Invalid/expired API key | Rotate keys |
| Wrong currency behavior | Gateway/currency mismatch | Review workspace and gateway currency setup |

---

## Need help?

Share the failing invoice number and gateway type with **admin@bababuilds.com**.
