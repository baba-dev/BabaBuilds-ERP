---
title: "Connecting Razorpay & Stripe"
description: "Set up payment gateways, validate keys, and ensure every invoice includes actionable online payment links."
order: 5
category: "Payments"
tags: ["Stripe", "Razorpay", "Payments", "Invoice payments", "gateway"]
icon: "CreditCard"
estimatedMinutes: 9
isFeatured: true
dateModified: "2026-11-21"
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

If you started from pricing, your signup path now keeps plan intent (`/signup?plan=...&cycle=...&trial=...`) so billing setup lands in the right context after onboarding.

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

## Payment links and TDS

When a client deducts TDS, the invoice shows **Net payable** and the Razorpay or Stripe link asks for that net amount, not the full total. Pay-Fast and Receipt designs also show a QR from the link. If there is no link, they fall back to a UPI QR from your UPI ID. See [Invoice Designs](/help/invoice-designs).

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

---

## Troubleshooting

| Problem | What it usually means | What to do |
|---|---|---|
| Payment link not showing in PDF | Gateway is not fully connected | Re-open Settings, save keys again, and generate a fresh invoice |
| Checkout page errors | API keys are expired/incorrect | Rotate keys in gateway dashboard and update in ERP |
| Wrong currency shown | Gateway/currency setup mismatch | Verify workspace currency and gateway-supported currency |
| Client says payment failed | Network or card/auth issue | Ask client to retry and check gateway logs for failure reason |

---

## Do / Don’t

### Do
- Use test mode first before going live
- Rotate keys periodically
- Send one internal test invoice after key updates

### Don’t
- Share secret keys in chat or email
- Keep old compromised keys active
- Assume old PDFs update automatically after settings changes

---

## Related guides

- [Generating, Sending, and Collecting Invoices](/help/generating-invoices)
- [Configuring Your Business Profile & Workspace Settings](/help/settings-guide)
- [Optional Module: AR Aging + Collections Centre](/help/optional-sub-system-ar-collections)

---

## Article info

- **Last reviewed:** 2026-04-21
- **Owner:** Billing & Payments Team
- **Audience:** Founders, Finance Ops

---

## FAQ

### Can I connect both Stripe and Razorpay?
Yes, but set one as your active operational default for predictable behavior.

### Do old invoices get payment links after gateway setup?
No. Generate or reissue invoices after gateway connection to ensure links are present.

### What if a key is leaked?
Rotate it immediately in your gateway dashboard and update ERP settings.
