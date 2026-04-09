# Component Adoption Matrix

This matrix tracks frontend component rollout readiness, delivery controls, and design QA dependency mapping across phases.

> Note: Master Settings uses bespoke header by design.

## Rollout phases

- **Phase 1:** Navigation and shell consistency foundations.
- **Phase 2:** High-traffic dashboard workflows and forms.
- **Phase 3:** Data-density, specialty, and edge-case pages.

## Cross-component adoption

| Area | Scope | Owner | Status | Dependencies | Release Phase |
|---|---|---|---|---|---|
| Sidebar | Global dashboard navigation and collapsed/expanded behavior | Frontend Platform | In progress | Navigation token audit, route metadata map | Phase 1 |
| Data-table | Shared table patterns (sorting, filtering, pagination, row actions) | Frontend Platform + Feature Teams | Planned | API contract normalization, empty/error pattern library | Phase 2 |
| Forms | Form fields, validation messaging, submit/disabled/loading states | Product UI Team | In progress | Field primitives, form schema conventions | Phase 2 |
| Charts | KPI and trend visualizations with theme parity | Reporting Team | Planned | Chart theme tokens, legend/accessibility standards | Phase 3 |
| Landing | Marketing/entry shell polish and CTA consistency | Growth UI Team | Planned | Hero/content approvals, shared button styles | Phase 1 |
| Maps | Geospatial modules and marker/tooltip behavior | Ops Experience Team | Planned | Map provider token setup, fallback state UX | Phase 3 |

## Target page rollout mapping

| Target page | Primary components | Owner | Status | Dependencies | Release Phase |
|---|---|---|---|---|---|
| `/` | Landing, forms | Growth UI Team | Planned | Landing copy freeze, CTA tracking events | Phase 1 |
| `/login` | Forms | Product UI Team | In progress | Auth error/lockout message states | Phase 1 |
| `/dashboard` | Sidebar, charts, data-table | Frontend Platform + Reporting Team | In progress | Sidebar shell completion, KPI card token parity | Phase 2 |
| `/clients` | Sidebar, data-table, forms, maps | Client Ops Team | Planned | Client table API alignment, map geocoding config | Phase 2 |
| `/invoice` | Sidebar, forms, data-table | Billing Team | In progress | Validation matrix, line-item table interaction specs | Phase 2 |
| `/expenses` | Sidebar, forms, data-table | Finance Ops Team | Planned | Receipt upload/error handling states | Phase 2 |
| `/ledger` | Sidebar, data-table, charts | Finance Ops Team | Planned | Reconciliation chart model + row-level status tags | Phase 3 |
| `/reconciliation` | Sidebar, data-table, forms | Finance Ops Team | Planned | Matching-rule UX + unresolved-state flows | Phase 3 |
| `/retainers` | Sidebar, forms, data-table | Billing Team | Planned | Retainer lifecycle status model | Phase 3 |
| `/services` | Sidebar, forms, data-table | Services Team | Planned | Service catalog permissions | Phase 2 |
| `/proposals` | Sidebar, forms, data-table | Sales Ops Team | Planned | Proposal template migration | Phase 2 |
| `/tax` | Sidebar, forms, charts, data-table | Finance Ops Team | Planned | Tax period filtering and filing status badges | Phase 3 |
| `/ca-portal` | Sidebar, forms, data-table | Compliance Team | Planned | Role-based section visibility | Phase 3 |
| `/setup` | Sidebar, forms | Onboarding Team | In progress | Stepper UX + persisted draft states | Phase 1 |
| `/settings` | Sidebar, forms | Frontend Platform | In progress | Settings layout unification | Phase 1 |
| `/settings/profile` | Sidebar, forms | Frontend Platform | In progress | Avatar upload and validation states | Phase 2 |
| `/settings/billing` | Sidebar, forms, data-table | Billing Team | Planned | Payment method state taxonomy | Phase 2 |
| `/admin` | Sidebar, data-table, forms, charts | Platform Admin Team | Planned | Permission matrix + audit-log table pattern | Phase 3 |
| `/help` | Landing, forms | Support Experience Team | Planned | Help IA updates + feedback form behavior | Phase 1 |
| `/help/[slug]` | Landing | Support Experience Team | Planned | Article template theme parity | Phase 2 |
| `/p/[token]` | Landing, forms | External Share Experience Team | Planned | Public token error/expired states | Phase 3 |
