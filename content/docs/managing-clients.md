---
title: "Managing Your Client CRM"
description: "Build a clean client master, reduce invoice errors, and improve relationship visibility across billing and collections."
order: 3
category: "Clients"
tags: ["CRM", "clients", "export", "GSTIN", "billing", "master data"]
estimatedMinutes: 9
isFeatured: true
dateModified: "2026-04-21"
---

# Managing Your Client CRM

Client CRM is your source of truth for billing identity, invoice behavior, and relationship history.

---

## Add clean client records

<Steps>
  <Step title="Open Client CRM">
    Go to <strong>Client CRM</strong> from the sidebar.
  </Step>
  <Step title="Click Add New Client">
    Enter legal and billing details.
  </Step>
  <Step title="Validate tax/export flags">
    Confirm country and export treatment before save.
  </Step>
</Steps>

| Field | Required | Why it matters |
|---|---|---|
| Client Name | Yes | Billing identity |
| Address | Yes | Invoice and compliance |
| Country | Yes | Export/domestic tax logic |
| Email | Recommended | Invoice delivery |
| Tax ID / GSTIN | Conditional | Compliance display |
| Export toggle | Conditional | Zero-rated export behavior |

---

## Export vs domestic behavior

When **Export Client** is enabled, invoices adjust to export-mode language and taxation treatment.

<HelpImage
  src="/help/diagrams/clients_export_vs_domestic.svg"
  alt="Diagram comparing export vs domestic client invoicing behavior"
  caption="Use export toggle correctly to avoid tax-treatment errors."
/>

---

## Edit and lifecycle-manage clients

- Update contact/tax details as needed
- Keep status labels clean (Active, Inactive, VIP)
- Preserve historical correctness for old invoices

---

## Client value intelligence

Use CRM + billing history to monitor:

- Lifetime billed amount
- Invoice count and frequency
- Relationship risk (overdues, inactivity)

---

## AI CRM commands

Example prompts:

- "Show invoices for Acme Corp this year"
- "Mark Zenith Labs as VIP"
- "List inactive clients with no invoices in 90 days"

---

## Need help?

Email **admin@bababuilds.com** with the client name and issue details.
