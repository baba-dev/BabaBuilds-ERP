# Dashboard KPI-impacting entity list

Any write endpoint that mutates these entities **must** invalidate dashboard cache for the affected workspace and log incidents via `noteDashboardCacheIncident` if invalidation throws.

## Entities and KPI impact

- **Proposal**
  - Accepted-uninvoiced proposals KPI
  - Proposal funnel KPI
- **Expense**
  - Monthly expense KPI
  - Net cash/health KPI
- **Inventory**
  - Stock health KPI
  - Restock expense impact KPI

## Enforcement checklist

1. Update `config/dashboard-kpi-impacting-entities.json` when adding/removing KPI-impacting entities or write endpoints.
2. Ensure each listed endpoint includes:
   - `invalidateDashboardCacheForWorkspace(workspaceId)`
   - `noteDashboardCacheIncident('invalidationFailures', ...)` in a `try/catch` wrapper.
3. Run `npm run check:kpi-impact` (also executed by `npm run lint`).
