# Production Readiness Deep Dive (API + Frontend)

_Date:_ 2026-04-22  
_Scope:_ `app/api/**`, `app/**`, `components/**`, selected `lib/**` dependencies used by API/frontend.

## 1) Audit coverage and method

- Counted implementation surface:
  - API route handlers: **192** (`app/api/**/route.ts`).
  - App pages: **80** (`app/**/page.tsx?`).
  - Client components: **176** (`"use client"` markers).
- Ran static quality checks and focused targeted scans:
  - `npm run -s typecheck` (passes in current environment).
  - `npm run -s lint` (fails due to pre-existing issues in codebase).
  - Pattern scans for placeholders, unimplemented branches, `any`, lint disables, and suspicious route links.

## 2) Stubs / incomplete implementations

### Critical

1. **Document OCR pipeline is queued with an unconfigured provider**.
   - Upload endpoint creates OCR jobs with `provider: 'UNCONFIGURED'` and a `placeholder provider` comment, meaning OCR is not production-wired from this path. This is a direct feature-completeness gap for document automation workflows.
   - Evidence: `app/api/documents/upload/route.ts`.

2. **Chat tool dispatch has explicit unimplemented path**.
   - The chat tool execution branch returns an error: `Tool ... is not recognized or not implemented.` for unknown/unsupported tool calls.
   - This should be turned into a typed allowlist with explicit product fallback behavior (user-facing), telemetry, and contract tests.
   - Evidence: `app/api/chat/route.ts`.

### Medium

3. **Billing cancel endpoint appears to only mutate local workspace state**.
   - `POST /api/settings/billing/subscription/cancel` downgrades workspace status in DB, but there is no provider cancellation handshake in this handler.
   - Risk: source-of-truth divergence with external billing provider lifecycle.
   - Evidence: `app/api/settings/billing/subscription/cancel/route.ts`.

## 3) Broken links / routing hazards

### High-confidence broken internal routes

1. **`/logs` link likely broken in dashboard right rail**.
   - Link points to `/logs` while admin logs are served from admin context (`/admin` uses `/api/admin/logs`).
   - No `/logs` page route exists under `app/**/page.tsx`.
   - Evidence: `app/(dashboard)/dashboard/dashboard-right-rail.tsx`.

2. **Reseller flow links include obsolete `/dashboard/...` prefixes**.
   - Route groups do not create URL path segments, so dashboard pages such as settings and referrals are exposed as `/settings/...` and `/referrals`.
   - Current links use `/dashboard/settings/billing` and `/dashboard/referrals`, likely causing 404s.
   - Evidence: `app/reseller/reseller-landing-client.tsx`, `app/(dashboard)/referrals/page.tsx`, and actual route pages under `app/(dashboard)/...`.

### Image integrity

- Sampled explicit static image references and confirmed at least one critical marketing asset exists (`/aiwa-media-group-logo.png` -> `public/aiwa-media-group-logo.png`).
- No immediate missing image in sampled explicit path references.

## 4) AI-placed mistakes (likely generated-code artifacts)

1. **Overuse of `any` across API/frontend critical paths**.
   - The lint run surfaces widespread `@typescript-eslint/no-explicit-any` warnings, including operational paths and dashboard modules.
   - This pattern is highly correlated with fast AI scaffolding and weak type safety.
   - Examples include: `app/(dashboard)/dashboard/charts-island.tsx`, `app/(dashboard)/proposals/[id]/actions.ts`, `components/inventory/ProductFormModal.tsx`, and several `lib/**` files.

2. **Route construction mistakes in UX-critical flows**.
   - Wrong `/dashboard/...` links strongly indicate generated routing assumptions not aligned with Next.js route groups.
   - Evidence files listed in section 3.

3. **Hook purity and effect anti-patterns detected by lint**.
   - `hooks/use-media-query.ts` triggers `react-hooks/set-state-in-effect` due to synchronous state set in effect body.
   - `hooks/use-notifications.ts` triggers purity warning for `Date.now()` in render path (`useRef(Date.now())`).
   - These are common generated-hook smells and can produce unstable behavior at scale.

## 5) Bad code quality (production risk)

1. **Lint status is not releasable**.
   - Current lint run reports `719` issues (`1 error`, `718 warnings`) in this environment.
   - This should block production readiness for a high-value SaaS ERP target.

2. **Type safety debt is material**.
   - Extensive `any` usage and lint disable directives reduce confidence in runtime safety and increase regression risk.

3. **Potential observability gaps**.
   - Error paths in some places use generic catches without structured context propagation; standardize error envelopes and trace IDs in API responses.

## 6) Prioritized remediation plan (for “million-dollar SaaS ERP” bar)

### Phase 0 (48-72 hours): stop user-facing breakage

- Fix known bad links:
  - `/dashboard/referrals` -> `/referrals`
  - `/dashboard/settings/billing` -> `/settings/billing`
  - `/logs` -> target real logs page (or remove until page exists)
- Add route smoke tests for all internal CTA links on:
  - dashboard right rail
  - reseller landing
  - referrals partner toolkit

### Phase 1 (1 week): eliminate incomplete product behavior

- Wire OCR provider strategy (or explicit disabled capability flag + UI message) for `documents/upload`.
- Replace chat “not implemented” fallback with:
  - strict tool schema validation,
  - robust fallback response,
  - telemetry for unsupported tool names,
  - contract tests per tool.
- Ensure billing cancel endpoint syncs with payment provider and idempotently reconciles local state.

### Phase 2 (1-2 weeks): code-quality hardening

- Introduce a lint baseline gate (ratchet down warnings each PR).
- Attack `no-explicit-any` in revenue-critical modules first:
  - billing, invoices, proposals, dashboard state parsing, auth/session adapters.
- Enforce typed API contracts (zod/valibot) for request + response payloads.
- Add route-level Playwright smoke tests for top business journeys.

### Phase 3 (ongoing): enterprise readiness

- SLOs + alerting for API error rates and latency by route group.
- Audit log consistency checks for privileged actions.
- Security review for upload/OCR pipeline and billing webhooks.
- Chaos drill for external provider outages (Stripe/Razorpay/OAuth/mail).

## 7) Bottom line

The product has strong breadth, but it is **not yet production-ready** for a premium ERP reliability bar until the high-confidence routing defects, stubbed integrations, and lint/type safety debt are addressed.
