# Email Billing optional module

Email Billing (`MIAB_BILLING`) is an opt-in ERP module for hosted Mail-in-a-Box products. It syncs read-only domain and mailbox inventory and maps hosted domains to ERP clients, retainers, and recurring invoice workflows.

## What it does

- Connect one or more Mail-in-a-Box inventory sources.
- Sync domains, mailboxes, quotas, admin flags, archived/removed status, and alias counts where available.
- Show unmapped domains, domains without linked retainers, inactive inventory, and billing review notes.
- Map a hosted domain to a `Client`.
- Link an existing `Retainer` or create a new recurring retainer with `RetainerItem` rows.

## What it does not do

The ERP is not a Mail-in-a-Box admin panel. It does not create/delete mailboxes, change passwords, set quotas, manage admins/aliases, edit DNS, restart/update servers, or expose raw MiaB admin API access in the browser.

## Recommended connection approach

Use a small read-only adapter controlled by your infrastructure and configure its HTTPS URL as the server `baseUrl`. The adapter should return normalized inventory JSON with `syncedAt`, `domains`, `mailboxes`, quota/admin/status data, and alias counts.

Direct MiaB API mode is server-side fallback only and is restricted to read endpoints: `/mail/domains`, `/mail/users?format=json`, and `/mail/aliases?format=json`.

## Setup workflow

1. Enable the optional **Email Billing** module for the workspace.
2. Add a server with name, base URL, access mode, and optional token. Existing tokens display as `SET` and are never returned by API responses.
3. Run **Sync now** to import read-only inventory.
4. Map each domain to an ERP client.
5. Link an existing retainer or create a new retainer using fixed domain, per-mailbox, or manual package billing.

## Usage-based billing

A daily job (`/api/cron/email-hosting`, see `docs/cron.md`; schedule it before `process-retainers`) keeps billing in step with the mail server:

1. **Sync** the mail servers, when the workspace sync preference is `DAILY` or `WEEKLY` (`MANUAL` never syncs on a schedule).
2. **Usage snapshot**: one row per subscription per UTC day (mailboxes, admins, aliases, quota, billable mailboxes). Billable mailboxes are active ones, excluding admins if that setting is on. Re-running the same day updates that day's row.
3. **Trials**: a subscription created with `trialDays` is `TRIALING` and not billed. When the trial ends the job creates a retainer that starts billing on that date (or keeps an active retainer you already linked); if that is not possible, it adds a review item.
4. **Quantity changes**: the billable count is compared with what is being billed. By default a change is queued as a review item and you approve it (**Apply new mailbox count** in the review queue, or `POST /api/email-billing/subscriptions/:id/apply-quantity`). With *Auto-update retainer quantities* on (workspace) or `autoUpdateQuantity` (subscription) it is applied automatically.

Applying a change updates the retainer lines the calculator manages (lines you added by hand are never touched), records the change in the quantity ledger and the retainer history, and:

- **Increases mid-cycle** queue a prorated one-off charge (the extra recurring price x the part of the cycle left, in whole days) as pending usage on the retainer, so the next invoice bills it. Turn this off with *Prorate mailbox increases*. FIXED plans never prorate.
- **Decreases** take effect from the next invoice; there is no credit for the current cycle.

*Mailbox count used for billing*: `LATEST` bills the newest reading; `HIGH_WATER_MARK` bills the highest reading since the current cycle started. The retainer job remains the only thing that creates invoices, and an invoice can be traced to the usage behind it with `GET /api/email-billing/subscriptions/:id/usage` (snapshots, quantity changes, the retainer's invoices and proration lines).

The dashboard and AI summary report **MRR** as what the retainer engine will bill each month (active retainers, base currency, same formula as the Retainers page), plus trial/unbilled pipeline, 30-day churn (subscriptions that cancelled over those active 30 days ago), mailbox growth and new subscriptions.

## Availability and permissions

Email Billing is available on every plan, free and paid; the workspace owner still has to enable the module.

Access is controlled by dedicated permissions, shown under **Email Hosting** in the roles matrix:

| Permission | Allows | Default roles |
|---|---|---|
| `email_hosting.view` | Read domains, mailboxes, plans, subscriptions, review queue | Everyone who has `invoices.view` |
| `email_hosting.billing` | Change plans, subscriptions, retainer links, review items | Owner, Admin, Finance Manager |
| `email_hosting.admin_server` | Add/edit servers and tokens, test connections, run syncs, change settings | Owner, Admin |
| `email_hosting.operate` | Reserved for future mailbox operations; not used yet | Owner, Admin |

For compatibility the routes also accept the permission the module used before these keys existed (`invoices.view`, `invoices.edit`, `invoices.create` for creating retainers, `workspace.manage_settings`), so no existing role loses access. Every mutation writes an `email_billing.*` entry to the activity log; entries never contain tokens or passwords.

## Security notes

Configured URLs are validated before server-side fetches. Production requires HTTPS and blocks localhost, loopback, link-local, and private network ranges. Sync never hard-deletes inventory; missing domains and mailboxes are marked `REMOVED` for auditability and are reported once, not on every later sync. Each domain, with its mailboxes and review items, is written in a single database transaction, so a failure never leaves a half-imported domain.

## Plans and subscriptions

Plans define reusable hosted email packages: fixed domain pricing, per-mailbox pricing, bundle-plus-extra pricing, and manual packages. Subscriptions snapshot plan pricing at creation time so later plan edits do not silently change existing customers.

A subscription links hosted inventory to a client, plan, optional retainer, billable mailbox count, and review state. Creating a retainer from a subscription uses the existing ERP `Retainer` and `RetainerItem` engine; Email Billing does not create a parallel invoice system.

## Review queue workflow

Sync creates review items for new domains, unmapped domains, missing subscriptions, missing retainers, mailbox-count changes, removed domains, active billing on removed domains, and sync failures. Duplicate open review items are deduped in server-side code.

Mailbox-count changes are review-first by default. Retainer quantities are not changed after sync unless a user explicitly approves a recalculation or a workspace/subscription explicitly enables auto-update behavior.

## Manual testing checklist

1. Enable `MIAB_BILLING` for a workspace.
2. Create a read-only adapter server under `/api/email-billing/servers`.
3. Run `/api/email-billing/servers/:id/test`, then `/sync`.
4. Confirm `/email-billing/review` shows new-domain and missing-billing items.
5. Create plans under `/api/email-billing/plans` or `/email-billing/plans`.
6. Create a subscription for a mapped domain.
7. Create or link a retainer and verify the existing retainer cron remains responsible for invoice generation.

## Explicit boundary

The ERP does not administer Mail-in-a-Box mailboxes. Mailbox operations must remain inside Mail-in-a-Box.
