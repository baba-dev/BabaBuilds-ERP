---
title: "Getting Started with BabaBuilds ERP"
description: "Onboarding walkthrough from plan-aware signup to first invoice, with persona-specific setup guidance."
order: 1
category: "Getting Started"
tags: ["onboarding", "setup", "workspace", "first invoice", "signup"]
estimatedMinutes: 8
isFeatured: true
icon: "Rocket"
dateModified: "2026-04-29"
---

# Getting Started with BabaBuilds ERP

Welcome to BabaBuilds ERP. This guide helps you go from a new workspace to your first professional invoice in a few focused steps.

## What you can run from one workspace

- Invoicing and collections
- Client and retainer management
- Expense and tax visibility
- Payment links (Stripe / Razorpay)
- Optional advanced subsystems (cash flow, payroll, documents, reporting)

---

## Step 1 — Start from plan-aware signup

<Steps>
  <Step title="Choose plan + trial intent">
    Start from a plan-aware URL such as **/signup?plan=pro&cycle=monthly&trial=15**. This preserves your selected billing intent during authentication.
  </Step>
  <Step title="Complete secure sign-in">
    Continue through **/login** and confirm your workspace context before entering records.
  </Step>
</Steps>

<HelpImage src="/help/diagrams/erp_entrypoint.svg" alt="User entering ERP workspace to begin onboarding" caption="Start in the correct workspace to avoid data being saved under the wrong business." />

---

## Step 2 — Pick onboarding persona and complete Settings

On first dashboard load, choose your persona (CA, Agency, Freelancer, or Contractor) to get a guided money-task path. Then open **Settings** and complete:

- Company identity and logo
- Tax and compliance IDs
- Bank remittance details
- SMTP (if sending invoice emails)
- Payment gateway (optional)

See full guide: [Configuring Your Business Profile & Workspace Settings](/help/settings-guide)

---

## Step 3 — Add core master data

Before invoicing, add these records:

1. **Client CRM** entries
2. **Service Catalog** items
3. Retainer details (if recurring billing)

This prevents repetitive manual entry during invoice creation.

---

## Step 4 — Generate your first invoice

1. Open **Invoices & Earnings** / **New Invoice**
2. Select client and billing period
3. Add service line items
4. Generate PDF
5. Send via email (if SMTP configured)

See: [Generating, Sending, and Collecting Invoices](/help/generating-invoices)

---

## Step 5 — Enable optional subsystems as needed

From **Settings → Workspace Modules**, enable only what your team will actively use.

Common rollout order:

1. Document Vault
2. Cash Flow
3. Reporting Center
4. Payroll + Workforce

See: [Optional Sub Systems — Overview](/help/optional-sub-systems-overview)

---

## Related guides for launch workflows

- [Personalized onboarding and money-task paths](/help/personalized-onboarding)
- [Guided money flows in the dashboard](/help/guided-money-flows)
- [Demo to real business migration path](/help/demo-to-real-business)

---

## Recommended first-week checklist

- [ ] Business profile completed
- [ ] 3–5 clients added
- [ ] 3–5 service templates added
- [ ] Test invoice sent to your own email
- [ ] Payment gateway tested (if enabled)
- [ ] At least one advanced module enabled and verified

---

## Need help?

Email **admin@bababuilds.com** with screenshots of the step where you’re blocked.

---

## FAQ

### Do I need to complete every Settings field before first invoice?
No. Start with company identity, tax basics, and bank details. You can refine other fields later.

### Can I invite my team right after setup?
Yes. Once basic settings are saved, you can onboard team members and assign operational responsibilities.

### What should I do if my first invoice fails?
Check client data, required fields, and SMTP/gateway setup. Then retry from a fresh draft.
