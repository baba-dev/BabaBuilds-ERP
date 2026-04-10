# Performance Audit Follow-up Plan (2026-04-10)

## Scope
This follow-up plan defines baseline measurements, release safety rails, and rollback procedures for dashboard performance optimizations shipped after the April 10, 2026 audit.

## 1) Baseline metrics (must be captured before any optimization rollout)

### Web baseline (dashboard route)
Capture these metrics on `/dashboard` with production build settings and representative tenant data:

- **LCP (Largest Contentful Paint)**
  - Record p50 and p95 from real-user monitoring (RUM) for authenticated dashboard visits.
- **INP (Interaction to Next Paint)**
  - Record p50 and p95 for core interactions on the dashboard (filtering, tab switches, chart hover/click interactions).
- **JavaScript transferred (dashboard payload)**
  - Record total JS transferred on first authenticated dashboard load.
  - Break out by initial route chunk vs async chunks where tooling allows.

### API baseline (`/api/dashboard`)
Capture latency distributions from server telemetry:

- **p50 response time** for `GET /api/dashboard`
- **p95 response time** for `GET /api/dashboard`

Store baseline captures in the release ticket and in weekly perf notes before enabling any optimization flag.

## 2) Smoke test checklist for critical flows
Run this checklist for each optimization before and after enabling its flag in production:

1. **Login redirect**
   - User can authenticate and is redirected to `/dashboard` successfully.
2. **Invoice creation**
   - User can create and save a new invoice without client or server errors.
3. **Payment marking**
   - User can mark an invoice as paid and status updates correctly in UI and API responses.
4. **Reconciliation**
   - Reconciliation view loads, row actions complete, and totals remain consistent.
5. **Chat prompt action**
   - Dashboard chat prompt action executes and returns a valid response payload.

Record pass/fail, timestamp, and environment for each smoke run.

## 3) Feature-flag requirement
Each performance optimization must be shipped behind a feature flag **where feasible**.

- Flag naming convention: `perf_<area>_<optimization>` (example: `perf_dashboard_deferred_charts`).
- Flag defaults to **off** in production until baseline + smoke checks pass.
- If an optimization cannot be reasonably flagged, document the reason and required risk mitigations in the rollout ticket.

## 4) Rollout policy (one optimization at a time)
Roll out exactly one optimization at a time. Do not overlap active rollout windows.

For each rollout:

1. Enable flag for a narrow cohort.
2. Monitor for at least one full observation window (minimum 24 hours) before broader rollout.
3. Track:
   - Application error rate (client + server)
   - `/api/dashboard` p50/p95 response latency
4. Promote, pause, or rollback based on observed impact against baseline.

## 5) Follow-up rollback steps per optimization
For every optimization task, add and maintain a rollback block in this document using this template:

### Optimization: `<name>`
- **Flag:** `<flag_name>`
- **Owner:** `<team/person>`
- **Deploy date:** `<YYYY-MM-DD>`
- **Primary risk signals:** `<error spikes, p95 latency regression, UX breakage>`

**Rollback steps**
1. Disable `<flag_name>` in production.
2. Verify config propagation to all app instances.
3. Re-run critical smoke checklist (login redirect, invoice creation, payment marking, reconciliation, chat prompt action).
4. Confirm error rate and `/api/dashboard` p50/p95 return to pre-rollout baseline.
5. Post incident/update note in rollout channel and append summary here.

## 6) API safety gate: no response schema changes
Any task that affects API behavior must include an explicit **“no response schema changes”** check before rollout.

Required checks:

- Verify response shape for `/api/dashboard` is unchanged (fields, nesting, and types).
- Confirm consumers (dashboard UI and dependent clients) require no contract updates.
- Attach evidence in task/PR (test output, typed contract check, or schema snapshot diff).

If schema changes are required, the task must be re-scoped as a contract change and follow the API versioning/change-management process instead of the performance-only path.
