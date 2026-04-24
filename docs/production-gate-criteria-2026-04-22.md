# Production Gate Criteria (Enforceable)

_Date: 2026-04-22_  
_Scope: API + Frontend release readiness for BabaBuilds ERP_

## 1) Gate outcome model

- **PASS**: no blocking criteria violated.
- **CONDITIONAL**: no blockers, but one or more warning thresholds violated with approved risk acceptance.
- **FAIL**: one or more blocking criteria violated.

## 2) Blocking criteria (must-pass)

| Gate ID | Criterion | Threshold | Evidence artifact |
| --- | --- | --- | --- |
| GATE-001 | Open P0 findings | `0` | `docs/production-readiness-findings-register-2026-04-22.json` |
| GATE-002 | Open P1 findings without owner/ETA | `0` | `docs/production-readiness-findings-register-2026-04-22.json` |
| GATE-003 | Broken internal route targets in audited CTA set | `0` | `docs/reports/route-integrity-report.json` |
| GATE-004 | Typecheck status | Pass required | CI run / `npm run typecheck` |
| GATE-005 | Top-journey E2E failures (top-20) | `0` failures | CI Playwright report (to be attached per release) |
| GATE-006 | Authz bypass defects in critical APIs | `0` known open | Security/API review evidence |
| GATE-007 | Billing source-of-truth mismatch incidents unresolved | `0` | Billing reconciliation report |

## 3) Warning criteria (non-blocking with signoff)

| Gate ID | Criterion | Warning threshold | Escalates to fail when |
| --- | --- | --- | --- |
| WARN-001 | New lint warnings introduced in changed files | `> 0` | Repeated in 2 consecutive releases |
| WARN-002 | Non-critical route warnings (known exceptions) | `> 0` | Any warning affects checkout/billing/auth flows |
| WARN-003 | Dashboard/UI console errors on smoke routes | `> 0` | Error impacts data integrity or payment UX |

## 4) Severity rubric for findings

| Severity | Definition | Typical examples | SLA target |
| --- | --- | --- | --- |
| P0 | Immediate production risk, financial/compliance/security impact likely | checkout failures, authz bypass, data loss path | Immediate before release |
| P1 | High-impact defect with plausible user harm or trust breach | broken revenue routes, provider sync gaps | Before next release cut |
| P2 | Medium risk, operational degradation but workaround exists | partial observability, weak fallbacks | Scheduled sprint |
| P3 | Low-risk quality/maintainability debt | style drift, low-priority warnings | Backlog |

## 5) Required signoffs

- Engineering owner
- Security/Compliance owner (for security-sensitive changes)
- Product owner (for user-impacting exceptions)

All conditional passes must include:
- explicit risk statement,
- expiration date,
- assigned owner.
