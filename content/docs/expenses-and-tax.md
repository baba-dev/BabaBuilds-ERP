---
title: "Tracking Expenses & Tax Savings"
description: "How to log business expenses, track tax-saving investments (80C/80D), and use BabaBot to estimate your tax liability."
order: 7
category: "Tax & Compliance"
tags: ["expenses", "tax", "80c", "80d", "gst", "deductions", "bababot"]
icon: "shield-check"
estimatedMinutes: 7
isFeatured: false
dateModified: "2026-04-14"
---

# Tracking Expenses & Tax Savings

BabaBuilds ERP helps you track your **business expenses** and **tax-saving investments** so you always have a clear picture of your net profitability and estimated tax liability.

---

## Logging Expenses

<Steps>
  <Step title="Open Expenses & Margins">
    Navigate to <strong>Expenses & Margins</strong> in the sidebar.
  </Step>
  <Step title="Create an expense">
    Click <strong>Add Expense</strong>.
  </Step>
  <Step title="Fill the fields and save">
    Use the guide below for what each field means.
  </Step>
</Steps>

| Field | Description |
|---|---|
| **Vendor** | Who you paid (e.g., "AWS", "Zomato") |
| **Amount** | Expense amount |
| **Category** | Accounting category (e.g., Software, Travel, Meals) |
| **Date** | Defaults to today |
| **Description** | Optional note |

---

## Using BabaBot to Log Expenses

You can log expenses by voice-style commands:

- *"Log ₹12,000 to Adobe under Software"*
- *"Add a ₹2,500 travel expense to Uber from last Friday"*
- *"Show me my expenses by category"*

BabaBot will categorize and save it automatically.

<Callout type="tip">
  If you want more accurate tax estimates, be consistent with categories. “Software”, “Travel”, and “Professional Services” are the biggest sources of reporting clarity.
</Callout>

---

## Understanding Expense Categories

Suggested categories that align with standard accounting:

- **Software** — Subscriptions, SaaS tools
- **Travel** — Flights, taxis, fuel
- **Meals & Entertainment** — Client dinners, team lunches
- **Office Supplies** — Hardware, stationery
- **Professional Services** — Chartered accountant, legal fees
- **Marketing** — Ads, design tools

---

## Tax Savings (80C & 80D)

Navigate to **Savings & Tax** in the sidebar to log tax-saving investments.

### Section 80C (Limit: ₹1,50,000)
Log investments in:
- PPF (Public Provident Fund)
- ELSS (Equity Linked Savings Scheme)
- Life Insurance Premium
- NSC, Tax-saver FDs

### Section 80D (Limit: ₹25,000)
Log:
- Health insurance premiums for self and family

---

## Reviewing Your Tax Position

The **Dashboard** shows an **Estimated Tax** KPI card at all times.

For a detailed breakdown, ask BabaBot:

- *"Calculate my estimated tax liability"*
- *"How much have I invested under 80C?"*
- *"What is my net profit after expenses?"*

BabaBot uses this formula:

```
Taxable Income = Revenue − Expenses − (80C + 80D deductions)
Estimated Tax  = Taxable Income × 30%
```

<HelpImage
  src="/help/diagrams/tax_estimate_model.svg"
  alt="Tax estimate model showing revenue, expenses, deductions, taxable income, and estimated tax"
  caption="A simple model of how the ERP estimates taxable income (you can always override with your CA’s guidance)."
/>

---

## CA Portal

Navigate to **CA Compliance** in the sidebar for a comprehensive compliance view. This portal is designed for your Chartered Accountant to review your financial summary without affecting any data.

---

## Questions?

Reach out to our team at **admin@bababuilds.com** for expense or tax-related guidance.
