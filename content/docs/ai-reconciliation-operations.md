---
title: "AI Reconciliation Operations"
description: "Use AI Reconciliation to match transactions, resolve exceptions, and finalize accounting entries."
order: 30
category: "Finance"
tags: ["reconciliation", "bank", "ai"]
estimatedMinutes: 8
dateModified: "2026-06-08"
---

# AI Reconciliation Operations

Closing the books shouldn't take days. AI Reconciliation intelligently matches imported bank feed activity against your open invoices and logged expenses to finalize accounting entries quickly and accurately.

<HelpImage src="/help/screenshots/help-reconciliation-01-overview.png" alt="AI Reconciliation overview page" caption="Reconciliation queue and status overview." />

## The Reconciliation Workflow

<HelpImage src="/help/screenshots/help-reconciliation-02-primary-action.png" alt="AI Reconciliation primary action" caption="Primary match/review actions for transaction finalization." />

<Steps>
  <Step title="Import Bank Statement">
    Upload your monthly bank statement (CSV/OFX) into the reconciliation engine.
  </Step>
  <Step title="Run AI Matching">
    The system will automatically suggest matches based on exact amounts, dates, and vendor/client names.
  </Step>
  <Step title="Review and Confirm">
    Scan the suggested matches. For high-confidence matches, you can bulk-approve them.
  </Step>
  <Step title="Resolve Exceptions">
    For transactions the AI couldn't match confidently, manually search and assign them to the correct invoice, expense, or custom ledger account.
  </Step>
</Steps>

## Finalizing Entries

<HelpImage src="/help/screenshots/help-reconciliation-03-detail.png" alt="AI Reconciliation detail" caption="Detailed review context before ledger write." />

Once a bank transaction is matched to an invoice, that invoice is permanently marked as "Paid," updating your cash flow and dashboard metrics instantly.

## Best Practices

**Do**
- Reconcile weekly rather than monthly to prevent a massive backlog and catch missing receipts early.
- Ensure your invoice numbers are clearly communicated to clients so they include them in their bank transfer reference fields (which drastically improves AI match rates).

**Don't**
- Blindly bulk-approve low-confidence matches. Always verify the client name against the payment source.
