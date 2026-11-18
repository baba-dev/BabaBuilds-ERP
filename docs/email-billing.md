# Email Hosting (Email Billing) optional module

Email Hosting (`MIAB_BILLING`) is the owner console for a hosted-email business on Mail-in-a-Box (for example a mail service sold to many external customers). It is available on every plan and is opt-in per workspace. It is built for four jobs:

1. **See what is being served**: every domain and mailbox, with quota and usage, searchable.
2. **Never forget a payment**: each domain is billed on the anniversary of the day it was issued, and a payments calendar and digest say what to collect and when.
3. **Check quotas and run the everyday operations** without sending anyone to the Mail-in-a-Box admin page.
4. **Keep writes optional**: changing anything on a mail server is a module setting, off by default.

The people who pay are normal ERP **Clients** (customers) of the workspace; they never log in to the ERP.

## What it does

- Connect one or more Mail-in-a-Box servers (read-only adapter, direct read access, or managed mode).
- Sync domains, mailboxes, quotas, usage (when the source reports it), admin flags and alias counts.
- Set up billing for a domain in one step (customer, plan, issue date), one at a time or for many domains at once.
- Bill through the existing Retainer and Invoice engine, with usage-based quantity changes and proration.
- Show a payments calendar, unpaid invoices and what is not being billed, and send a payments digest.
- Optionally run mailboxes from the ERP (see *Managed mode*), including adding new customer domains.

## Mailbox management: a module setting

**Settings -> Allow mailbox management from the ERP** is a switch for the whole module, off by default. While it is off the module only reads inventory and runs billing: the create/reset/quota/suspend/delete controls and the Operations page link are not shown, and the API refuses every write. Turning it on (or off) needs the server-admin permission and is written to the activity log. A write also needs the server itself to be in managed mode with writes enabled (below), so there are two deliberate steps. Operations already scheduled (such as a delayed delete) do not run while the switch is off; they fail with a clear message and the mailbox stops showing as scheduled.

## Billing follows the issue date

Different domains are issued on different days, so each is billed on its own day:

- **Set up billing** (domain page, or *Set up billing for many* on the Domains page). You choose the customer (searched by name or email, or a new one), the plan and the **issue date** (defaults to the day the domain was first seen; change it to the real date for existing customers). The first invoice falls on the next anniversary of the issue date (monthly, quarterly or yearly depending on the plan), counted from the issue date so a domain issued on the 31st is billed on the last day of shorter months and never drifts. A trial in days, or an explicit first invoice date, can be given instead. The current term is assumed already paid; choose the first invoice date yourself to bill it now.
- **Bulk setup** applies one plan to every domain that is not billed yet. Preview first; nothing changes until you apply. At most 200 domains are handled per run (run it again for the rest). Domains without a customer are skipped unless you ask for a customer named after the domain to be created (customers created this way have no address or email, so review them). **Invoice emails are off by default for bulk setup**, so nobody receives an invoice before you have checked their address.
- **Payments calendar** (`/email-billing/calendar`): domains by billing date for the next 60 days (including any whose date passed without an invoice), unpaid and overdue invoices from email hosting, and the count of domains that are not billed at all, which are the ones that would otherwise be forgotten.
- **Payments digest**: a notification (in-app and email) listing billing dates and unpaid invoices from the next 7 days plus anything overdue. It is sent from the daily job only when there is something to collect, once per day (or on Mondays with the weekly setting, or never with Off), and only to people who can see billing.

Invoices themselves are raised, emailed and chased by the existing recurring-billing job; the calendar and digest are the checklist on top. One known property of that job: it moves a billing date that lands on a weekend back to the Friday and carries on from there, so over a long time a domain's day can drift by a day or two. The calendar always shows the date the job will actually use.

## Automatic onboarding of new domains

Import is automatic: servers are re-synced on the Daily or Weekly setting, and new mailboxes flow into billing through the usage job. **Automatic onboarding** goes one step further for new customers. Switch it on in Settings (it needs a default plan) and, from then on, a domain that appears on a server is brought into the ERP without anyone touching it:

- a customer named after the domain (rename it and add an email address afterwards; a review item reminds you),
- a subscription on the default plan, dated from the day the domain appeared, with an optional free trial,
- a recurring retainer, so the invoice job, payments calendar, digest, usage-based quantity changes and quota alerts all apply.

Safeguards, because this creates billing for people outside the ERP:

- Off by default, audited, and needs the server-admin permission. **Only domains first seen after you turn it on are touched**, and only after that server has finished one successful sync, so connecting a server (or turning the setting on) never bills your existing customer base. Existing customers go through *Set up billing for many*, which previews first.
- Domains you already linked or started billing by hand are left alone.
- If more than 25 new domains appear in one run it is treated as a re-import: nothing is set up, and a review item asks you to use the previewed bulk setup.
- Invoices are **not emailed** unless you tick the option (an auto-created customer has no email address until you add one).
- Anything that cannot be set up (Free-plan client limit, a manual-priced plan, an error) raises a review item and is retried the next day; it never blocks the rest.

Mailboxes are not billed one by one: a domain is billed through its plan, and its mailbox count drives the price (see *Usage-based billing*). A new mailbox on a billed domain is therefore picked up by the next daily run and either applied or queued for approval.

## Mailboxes, quotas and the directory

`/email-billing/mailboxes` lists every active mailbox with its domain, customer, quota and used space, with search (address or customer) and filters (almost full, suspended, admins, no usage reported), 50 per page. Used space is shown only when the source reports it (`usedMb` from an adapter, or the box size from the mail server); otherwise it reads "Not reported", never zero. A mailbox at or above the alert level (default 90%, 0 turns it off) raises one review item per domain listing the fullest mailboxes, and clears itself when they drop below it.

## What it does not do

The ERP is not a full Mail-in-a-Box admin panel. It never edits DNS, TLS certificates, backups, admin privileges or domains, and never restarts or updates a server. Mailbox and alias changes are possible only on a server in **managed mode** with writes switched on (see below); on every other server the module stays read-only. The raw Mail-in-a-Box admin API is never exposed to the browser.

## Recommended connection approach

Use a small read-only adapter controlled by your infrastructure and configure its HTTPS URL as the server `baseUrl`. The adapter should return normalized inventory JSON with `syncedAt`, `domains`, `mailboxes`, quota/admin/status data, and alias counts.

Direct MiaB API mode is server-side only and restricted to the read endpoints `/mail/domains`, `/mail/users?format=json` and `/mail/aliases?format=json` (relative to `/admin`). Responses grouped by domain, plain-text domain lists, quotas such as `5G` and `inactive` users are understood.

## Managed mode: running mailboxes from the ERP

A server whose access mode is `MANAGED_API` can be operated from the ERP once **Allow mailbox management** is on in the module settings. Set it up in this order:

1. Create a **dedicated admin account** in Mail-in-a-Box for the ERP (do not reuse a person's account; Mail-in-a-Box has no scoped tokens, so this credential can do anything on the box). It must not have two-factor authentication enabled.
2. Add the server with access mode `MANAGED_API`, the box address (the API is reached under `/admin`; a bare host name is fine) and the token `admin-email:password` (or `admin-email:api-key`). The token is stored encrypted and never returned to the browser.
3. Run **Test connection**, then edit the server and tick **Allow write operations**. The ERP checks the credential against the box and records the box version before it allows anything. Changing the address, access mode or credential switches writes off again.

What can be done (permission **Email Hosting: operate**, owners and admins by default; deleting needs **admin server**):

| Operation | Notes |
|---|---|
| Create mailbox | Optional quota. Shows a generated password **once**; it is not stored. |
| Reset password | New random password, shown once. |
| Set quota | MB; 0 = unlimited. |
| Add / remove alias | On a domain of the server. |
| Suspend | Locks the login by setting a random password nobody knows. Mail keeps arriving. |
| Resume | Issues a fresh password, shown once. |
| Add domain | Creates a customer domain on a server by creating its first mailbox (server-admin permission). DNS and the certificate are then handled on the mail server. |
| Delete | Needs the address typed back and waits 7 days by default (0 to 30). Cancel any time before it runs. |

Safety rules:

- Admin mailboxes and the account the ERP connects with cannot be reset, suspended or deleted from the ERP.
- Every change is recorded as an operation (Operations page, `/api/email-billing/operations`) with who asked, the result and any error. Passwords, tokens and server error text containing them are never stored or logged. Operations that show a password run immediately and are not retried by a job (a failure means request it again); other operations are retried with backoff by `/api/cron/email-hosting-operations`, which also runs scheduled deletes. A repeated request with the same `idempotencyKey` returns the first result instead of repeating the change.
- After create and delete the ERP re-reads the box and records whether the change was confirmed. A later sync reconciles anything that drifted.
- Creating or deleting a mailbox changes the billable count; the daily usage job then proposes (or applies) the quantity change as described above.
- The AI assistant has no access to any of this.

## Setup workflow

1. Enable the optional **Email Hosting** module for the workspace (any plan).
2. Add a server (name, base URL, access mode, token). Tokens display as `SET` and are never returned by the API.
3. Run **Sync now** to import domains and mailboxes. Choose how often the daily job re-syncs under Settings (Manual, Daily or Weekly).
4. Create your plans (price, mailboxes included, monthly/quarterly/yearly).
5. Set up billing: per domain from its page, or **Set up billing for many** on the Domains page. Enter the real issue dates for existing customers.
6. Add the daily job to cron (`docs/cron.md`, before `process-retainers`) so usage, trials, quota alerts and the payments digest run.
7. Only if you want to run mailboxes from the ERP: turn on **Allow mailbox management** in Settings, put a server in managed mode and enable writes on it.

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

## Boundary

Only mailbox and alias operations on a managed server with writes enabled are performed by the ERP. Everything else on the box (DNS, TLS, backups, admin privileges, domains, updates) stays in Mail-in-a-Box.
