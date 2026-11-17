# Email Hosting (Mail-in-a-Box) rework: plan

Status: decisions 2 (credential model) and plan availability are confirmed; Phases 0 and 1 are merged and Phase 2 (managed operations) is implemented; Phases 3 and 4 are not started. Replaces the read-only `MIAB_BILLING` ("Email Billing") module described in `docs/email-billing.md`.

## 1. Goal

Turn the ERP into the control plane for a hosted-email business built on Mail-in-a-Box (MiaB):

- Sell hosted email as a product: plans, subscriptions, trials, add-ons, proration.
- Operate it from the ERP: create/suspend/delete mailboxes, aliases, quotas, passwords, admin flags, DNS and SSL health, backups, server status.
- Bill it from the ERP: usage-driven invoices through the existing Retainer/Invoice engine, payment tracking, dunning, and suspension on non-payment.
- Connect it to the rest of the ERP: clients, invoices/AR, payments, notifications, activity log, reporting, dashboard, AI assistant, client portal, RBAC.

## 2. What exists today (audit)

| Area | State | Problem |
|---|---|---|
| Models | `MailBillingServer/Domain/Mailbox/Plan/Subscription/ReviewItem/SyncRun/Settings` | Good base; no orders, usage snapshots, operations/audit, mailbox-level billing, tenant ownership on mailboxes. |
| Client | `lib/email-billing/miab-client.ts` | GET-only (`/mail/domains`, `/mail/users`, `/mail/aliases`), SSRF-guarded. Strong; keep the guard, extend to writes. |
| Sync | `sync.ts` | Pull-only, sequential upserts per row, no transaction, mailbox removal not tied to billing, no drift handling beyond review items. |
| Billing | `billing-calculator.ts`, retainer link | Calculator exists but mailbox count changes are review-only; invoices only via the daily retainer cron. No proration, no usage snapshot per cycle, no suspend on overdue. |
| API | `app/api/email-billing/**` | Many routes are minified one-liners; most mutations use `request.json()` with no zod schema; all gated by `invoices.view/edit`, which is wrong for server admin actions; several mutations skip `logActivity`. |
| UI | server list, domains, plans, review, settings | No mailbox management, no operations log, no per-client view, no usage/MRR dashboard. |
| Docs/tests | explicit "ERP does not administer mailboxes" boundary; 144-line test file | The boundary is intentionally reversed by this rework; docs and tests must be rewritten together. |

## 3. Decisions

Confirmed: the credential model in item 2 (encrypted, dedicated MiaB admin account, never returned to the browser, adapter option kept) and that Email Hosting is available on all plans, free and paid. Item 1 (the ERP may write to Mail-in-a-Box) and the lock-the-password suspension are confirmed. Still open: item 3 (who the email customers are; the owner said they are not ERP clients) and item 4 (box versions), which matter from Phase 3 and 4.

1. **Scope reversal.** The current docs and guardrails say the ERP must never write to MiaB. This plan adds write operations behind an opt-in "Manage" access mode. Confirm this is wanted.
2. **Credential model.** MiaB has no scoped tokens: an admin API credential can do anything on the box. Recommendation: store it encrypted (existing `lib/encryption.ts`, AES-256-GCM), use a dedicated MiaB admin account for the ERP, never return it to the browser, and keep the adapter option for operators who want a narrower proxy.
3. **Who are the end customers?** Plan assumes the workspace owner resells email to its own ERP clients (a hosting provider / agency model). A customer self-service portal is Phase 4, not earlier.
4. **MiaB version support.** Endpoint shapes (notably quotas, MFA, `format=json`) vary by MiaB version; the client will detect the version via `/system/version` and gate features.

## 4. Target architecture

```
UI (server components + client actions)
  -> API routes (zod, RBAC, module gate, idempotency key, logActivity)
     -> lib/email-hosting/service/*   (domain logic, one function per use case)
          -> operations.ts            (queue + state machine for MiaB writes)
          -> billing/*                (pricing, usage snapshots, proration, invoicing)
          -> miab/*                   (typed client, SSRF guard, version detection)
          -> existing ERP libs        (retainers, invoices, notifications, activity-log)
Cron routes (CRON_SECRET): sync, usage-snapshot, dunning, operations-retry
```

Key principle: **the ERP database is the commercial source of truth; MiaB is the technical source of truth.** Every change is a recorded `MailOperation` that is applied to MiaB and then verified by re-reading it; drift is detected by sync and surfaced, never silently overwritten.

### 4.1 MiaB client (`lib/email-hosting/miab/`)

- Split `miab-client.ts` into `guard.ts` (existing SSRF/URL validation, unchanged and still tested), `client.ts` (typed calls), `normalize.ts`, `errors.ts`.
- Read: users, aliases, domains, `/system/status`, `/ssl/status`, `/dns/dump` (health only), `/system/backup/status`, `/system/version`.
- Write (only when `accessMode = MANAGED_API` and the caller holds the new permission):
  `POST /mail/users/add`, `/mail/users/remove`, `/mail/users/password`, `/mail/users/privileges/add|remove`, `/mail/users/quota`, `/mail/aliases/add|remove`.
  DNS and server restart/update stay out of scope for the first releases.
- Allow-list of endpoints (extend the existing test that asserts the endpoint list), per-request timeout, `redirect: 'error'`, no credentials in logs, response bodies truncated in stored errors.
- Passwords are generated server-side (or supplied once), sent to MiaB, never persisted. Welcome credentials are delivered once through a signed, expiring link (`lib/security/signed-links.ts`).

### 4.2 Data model additions (one migration, per `prisma/migrations/README.md`)

- `MailBillingServer`: add `adminEmail`, `miabVersion`, `capabilitiesJson`, `healthJson`, `lastHealthAt`; `accessMode` gains `MANAGED_API`. Data stays compatible (existing rows keep read-only modes).
- `MailBillingMailbox`: add `clientId`, `assignedToName`, `billable` (bool), `suspendedAt`, `provisionedByOperationId`, `lastLoginAt` if available.
- New `MailOperation`: `id, workspaceId, serverId, domainId?, mailboxId?, type (MAILBOX_CREATE | MAILBOX_DELETE | PASSWORD_RESET | QUOTA_SET | ALIAS_ADD | ALIAS_REMOVE | SUSPEND | RESUME | ...), status (PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED), payloadJson (no secrets), resultJson, idempotencyKey (unique per workspace), requestedByUserId, attempts, nextAttemptAt, source (UI | BILLING | API | AI)`.
- New `MailUsageSnapshot`: `subscriptionId, periodStart, periodEnd, mailboxCount, billableMailboxCount, totalQuotaMb, aliasCount, capturedAt`. This is the audited input to each invoice.
- New `MailAddOn` and `MailSubscriptionAddOn` (extra storage, backup retention, archiving) priced into the retainer lines.
- `MailBillingSubscription`: add `status` values `TRIALING | ACTIVE | PAST_DUE | SUSPENDED | CANCELLED`, `trialEndsAt`, `suspendAfterDays`, `suspendedAt`, `cancelAtPeriodEnd`.
- `MailBillingSettings`: dunning policy (grace days, suspend action: BLOCK_LOGIN vs QUOTA_ZERO is not available, see 4.4), proration toggle, usage-billing policy (HIGH_WATER_MARK | PERIOD_END | DAILY_AVERAGE).
- Every model keeps `workspaceId` scoping and the existing indexes pattern.

### 4.3 Billing engine

- Keep `Retainer` as the invoice generator; do not build a second invoicing system.
- Replace "review-only on mailbox change" with a policy-driven flow:
  1. Daily `usage-snapshot` cron writes `MailUsageSnapshot` per active subscription.
  2. `calculateMailBilling` (kept, extended for add-ons and proration) turns the snapshot into line items.
  3. Retainer items are updated through `lib/retainers/save.ts` only when policy allows (auto) or a user approves the review item (manual). A `RetainerPriceChange`/`RetainerEvent` is written either way.
  4. Mid-cycle additions create a one-off prorated invoice line (or credit) rather than changing the next cycle silently.
- Trials: subscription starts `TRIALING`; conversion creates/activates the retainer on `trialEndsAt` (cron, idempotent).
- Money handling follows `lib/money.ts` (Decimal, no floats) and `lib/financial-idempotency.ts`; add regression tests next to `lib/money-regression.test.ts` patterns.

**As built in Phase 1:** proration rides on the retainer engine's existing pending-usage lines (no parallel invoicing); only increases are prorated and decreases apply from the next invoice with no credit (a negative invoice line is not supported by the invoice engine); invoice linkage is read-side (invoice -> retainer -> usage snapshots/changes) rather than a new foreign key; MRR is taken from the active retainers so it matches the Retainers page. The mailbox *add-ons* item is deferred to a later phase.

**As built in Phase 2:** writes go through `MailOperation` rows (idempotent, workspace-scoped, audited) behind a per-server switch that is only accepted after the credential is proven on the box. Operations that show a password never store it, so they run inline and are not retried by jobs. Deletes wait 7 days by default. New domains and admin-privilege changes were left out on purpose. Endpoint shapes were written from knowledge of the Mail-in-a-Box API and are covered by contract-style tests with mocked responses; they still need one run against a disposable box.

### 4.4 Dunning and suspension (integration with AR)

- Hook into existing overdue-invoice detection (`lib/ar`, `lib/retainers/reminders.ts`): an overdue retainer invoice for a mail subscription moves it `ACTIVE -> PAST_DUE`, sends `BILLING_FAILED`-style notifications, then after `suspendAfterDays` queues `SUSPEND` operations.
- MiaB has no native "suspend" flag. Options: (a) remove then restore mailboxes (data loss, rejected), (b) change password to a random value and record the original is unrecoverable (blocks users, reversible only by new password), (c) remove the `MAILBOX` login via password reset while keeping mail delivery. Recommendation: (c) password rotation to a locked value, mail keeps being received, resume issues a fresh credential link. This must be validated on a real box before Phase 3 ships.
- Payment received (existing payment/webhook paths) automatically queues `RESUME` and resolves review items. Never auto-delete data; deletion requires a human-confirmed operation with a retention window.

### 4.5 Operations and safety

- All MiaB writes go through `MailOperation`: validated, authorized, idempotent, retried with backoff by a cron (`/api/cron/email-hosting-operations`), and verified by re-reading the object.
- Destructive operations (mailbox delete, domain delete) need typed confirmation, a distinct permission, and a 7-day soft-delete state before the MiaB call is executed.
- Rate-limit per workspace and per server (`lib/route-rate-limit.ts`), serialize writes per server to avoid MiaB races.
- Every operation and every billing change calls `logActivity`. Operation payloads and logs never contain passwords or tokens (test enforces this).

### 4.6 Permissions (RBAC)

Stop reusing `invoices.view/edit`. Add to `lib/permissions.ts` and role presets:

- `email_hosting.view`, `email_hosting.billing` (plans, subscriptions), `email_hosting.operate` (mailbox/alias operations), `email_hosting.admin_server` (servers, credentials, destructive actions).
- Module key stays `MIAB_BILLING` internally to avoid a data migration; the display label becomes "Email Hosting".

## 5. ERP integration map

| ERP feature | Integration |
|---|---|
| Clients | Per-client "Email" tab: domains, mailboxes, usage, subscription, invoices, operations. |
| Retainers/Invoices | Subscription owns one retainer; usage snapshot drives its lines; invoice links back to snapshot. |
| Payments/AR | Overdue drives PAST_DUE/suspend; payment drives resume. |
| Proposals/POS/Shop | "Add hosted email" line type that creates a subscription on acceptance/payment. |
| Notifications | New events: `MAIL_PROVISIONED`, `MAIL_SUSPENDED`, `MAIL_QUOTA_WARNING`, `MAIL_SERVER_UNHEALTHY`, `MAIL_SSL_EXPIRING`; email templates in `lib/notifications`. |
| Reporting/Dashboard | MRR, churn, mailbox growth, quota utilisation, per-server margin; Redis-cached with workspace invalidation like Phase 3. |
| AI assistant | Extend `lib/email-billing/ai-tools.ts`: read tools plus *propose-only* operations (AI cannot execute writes; a user confirms). |
| Activity log / Security | All mutations audited; high-risk actions respect existing MFA/segregation-of-duties rules. |
| Demo templates | Seed a managed demo server using a fake client (no network) so `npm run validate:demos` still covers the module. |
| i18n | Add keys to all `messages/*.json` (locale parity check is in CI). |

## 6. UI

- `/email-hosting` (redirect from `/email-billing`): overview with MRR, active mailboxes, quota, health, open review items.
- Servers: health card (SSL, backup, disk if exposed), capability badges, connection test.
- Domains/Mailboxes: table with create, quota, reset password, suspend, alias management; bulk actions queue operations.
- Plans/Subscriptions: wizard (client -> domain -> plan -> mailboxes -> start/trial), proration preview.
- Operations: timeline with status, retry, error detail.
- Review queue: kept and extended (drift, failed ops, past-due).
- Mobile conventions from AGENTS.md (`min-h-app`, `bottom-above-nav`, `pointer-coarse:`).

## 7. Phased delivery

Each phase is a separate PR that passes `npm run ci:fast`, is behind the existing module flag, and is non-breaking for current data.

| Phase | Scope | Exit criteria |
|---|---|---|
| 0. Hardening (done in this PR) | Split client into `miab/`; refactor one-liner routes into readable handlers with zod; add `email_hosting.*` permissions (keep `invoices.*` as a fallback); add missing `logActivity`; transactional sync; docs fix. | Existing tests green plus tests for each route's auth/validation; no behaviour change. |
| 1. Billing core (done) | `MailUsageSnapshot`, trials, statuses, auto/approved quantity updates, proration, invoice linkage, MRR/churn reports, dashboard cards. | Money regression tests; cron idempotent; retainer remains the only invoice generator. |
| 2. Managed operations (done) | `MANAGED_API` mode, `MailOperation` queue, mailbox/alias/quota/password operations, one-time credential links, operations UI, verify-after-write, drift review items. | Integration test against a mocked MiaB; manual run on a disposable MiaB box. |
| 3. Dunning and lifecycle | PAST_DUE/suspend/resume driven by AR and payments; soft-delete retention; notifications. | End-to-end test: overdue -> suspend -> pay -> resume; no data deletion path without human confirmation. |
| 4. Health and portal | `/system/status`, SSL/backup/health checks with alerts; client-facing portal page for usage and invoices; proposals/POS/shop line type; AI propose-only tools. | Alerts verified; AI cannot execute writes (test). |

## 8. Testing strategy

- Unit: endpoint allow-list, SSRF guard (existing), calculator (fixed, per-mailbox, bundle+extra, add-ons, proration), state machines.
- Route tests: auth, module gate, permission matrix, zod rejection, workspace isolation (IDOR), idempotency.
- Contract tests: recorded MiaB responses per supported version; mock server for operations.
- Security tests: no secrets in logs/operation payloads/API responses; production URL guard on every write.
- Demo/locale/migration checks via `npm run ci:fast`.

## 9. Risks

- MiaB admin credentials are all-powerful: blast radius if the ERP database and `ENCRYPTION_KEY` leak. Mitigate with encryption, a dedicated admin account, optional adapter mode, audit, and rotation UI.
- MiaB API differences across versions: capability detection and contract tests.
- Suspension semantics (see 4.4) need validation on a real box.
- Scope creep into a full MiaB admin panel: DNS, restarts, updates and TLS provisioning stay out until explicitly requested.

## 10. Rollout and compatibility

- Opt-in per workspace (existing module flag); `READ_ONLY_ADAPTER` and `DIRECT_MIAB_API` keep working unchanged.
- Migrations are additive; no rewrite of the applied baseline.
- Email Hosting is available on all plans, free and paid (it is removed from the paid-only module list in `lib/modules.ts`); the per-workspace opt-in stays.
- Production releases follow the Node 26 Stage 2 deployment safeguards in `AGENTS.md`; nothing here touches PM2 or the live interpreter.
