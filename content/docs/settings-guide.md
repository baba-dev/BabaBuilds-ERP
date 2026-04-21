---
title: "Configuring Your Business Profile & Workspace Settings"
description: "Complete operating guide for Settings, including branding, compliance, SMTP, AI, payment gateway, and optional module controls."
order: 8
category: "General"
tags: ["settings", "configuration", "workspace", "branding", "modules"]
estimatedMinutes: 12
isFeatured: true
dateModified: "2026-04-21"
---

# Configuring Your Business Profile & Workspace Settings

Settings is your ERP control panel. Values here affect invoices, communication, tax fields, and enabled modules.

## Open Settings

1. Go to **Settings** from the sidebar.
2. Update section values.
3. Click **Save Configuration**.

<HelpImage src="/help/diagrams/erp_entrypoint.svg" alt="ERP entry point and navigation to settings" caption="Use Settings as your command center for identity, finance, and module controls." />

## Identity & branding

| Field | Why it matters |
|---|---|
| Company Name | Appears on invoices and formal docs |
| Proprietor / Signatory | Printed in signatory area |
| Address | Billing and compliance context |
| Contact email and phone | Customer communication |
| Logo | Brand trust on PDFs |

## Compliance and tax identity

| Field | Usage |
|---|---|
| PAN / Primary tax ID | Core business identifier |
| Udyam / registration ID | Regional business registration |
| GSTIN / VAT ID | Tax reporting field |
| Default SAC/HSN | Service code fallback |

## Banking and remittance

Set remittance bank details exactly as you want them shown on invoices.

## SMTP (invoice email sending)

Add SMTP host, port, username, password, and from-email, then test by sending a sample invoice to yourself.

## AI assistant key

Add your Groq key to activate BabaBot features. You can rotate or delete keys anytime.

## Payment gateways

Connect Razorpay or Stripe to include pay links in invoice PDFs.

See: [Connecting Razorpay & Stripe](/help/payment-gateways)

## Optional Sub Systems

At the **Workspace Modules** section, you can enable advanced modules from settings:

- Workforce
- Payroll
- Revenue Pipeline
- Document Vault
- Cash Flow
- AR Aging + Collections Centre
- Reporting Center
- Import Manager

See: [Optional Sub Systems — Overview](/help/optional-sub-systems-overview)

<Callout type="info">Disabling a module hides it but does not delete its data.</Callout>
