---
title: "Inventory Hub Operations"
description: "Track inventory state, stock movement, and procurement context for operational planning."
order: 27
category: "Operations"
tags: ["inventory", "stock", "procurement"]
estimatedMinutes: 7
dateModified: "2026-06-08"
---

# Inventory Hub Operations

The Inventory Hub centralizes your stock posture, providing real-time visibility into stock movement, procurement needs, and fulfillment status to prevent stockouts and over-ordering.

<HelpImage src="/help/screenshots/help-inventory-01-overview.png" alt="Inventory overview page" caption="Inventory overview across available stock and movement." />

## Tracking Stock Movement

<HelpImage src="/help/screenshots/help-inventory-02-primary-action.png" alt="Inventory primary actions" caption="Primary inventory update and management actions." />

<Steps>
  <Step title="Access Inventory Hub">
    Navigate to **Inventory** in the sidebar.
  </Step>
  <Step title="Add or Update Items">
    Create new SKUs or update existing inventory counts. You can set minimum stock thresholds for automatic reorder alerts.
  </Step>
  <Step title="Log Stock Adjustments">
    Record manual adjustments for damages, shrinkage, or promotional giveaways to keep your ledger accurate.
  </Step>
</Steps>

## Procurement Context

<HelpImage src="/help/screenshots/help-inventory-03-detail.png" alt="Inventory detailed section" caption="Detailed inventory records and operational context." />

- **Low Stock Alerts:** Items that drop below their defined minimum threshold will appear in the dashboard action queue.
- **Purchase Orders:** Link inventory items directly to Purchase Orders to track incoming shipments and update stock automatically upon receipt.

## Best Practices

**Do**
- Perform a physical cycle count at least quarterly to reconcile the digital ledger with physical reality.
- Use standardized SKU naming conventions to make searching and reporting easier.

**Don't**
- Allow negative stock balances. If a sale occurs but the system says zero stock, fix the inventory count before generating the final invoice.
