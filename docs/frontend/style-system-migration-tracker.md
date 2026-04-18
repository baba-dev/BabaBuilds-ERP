# Style System Migration Tracker

_Last updated: April 18, 2026 (UTC)_

## Wave Plan

1. **Global shell/layout containers**
   - Scope: `app/layout.tsx`, `components/layout/*`
   - Goal: align base background/surface tone and sticky header treatment.
2. **High-traffic routes**
   - Scope: `/dashboard`, `/clients`, `/income`, `/expenses`, `/settings`
   - Goal: converge on shared typography + surface variants.
3. **Manual visual QA (light + dark)**
   - Checklist per page: hierarchy clarity, card density, button prominence, readability, spacing rhythm.
4. **Screenshots (before/after) + regression gate**
   - Require captures per page group before merge approval.

## Migration Status

| Group | Status | Notes |
|---|---|---|
| Global shells/layout containers | ✅ Migrated | Root and dashboard shells now use tokenized surface classes (`surface-base`, `surface-glass`, `border`). |
| `/dashboard` | 🟡 In progress | Route already uses `DashboardPageShell`; deeper card-level tokenization still pending in analytics modules. |
| `/clients` | 🟡 In progress | Page shell migrated; form/dialog surfaces still include mixed legacy zinc utility classes. |
| `/income` | 🟡 In progress | Page shell migrated; table + modal controls need final typography harmonization. |
| `/expenses` | 🟡 In progress | Page shell migrated; edit/delete dialogs still include legacy dark utility overrides. |
| `/settings` | ✅ Migrated (wave 2 baseline) | Route moved to `DashboardPageShell` with shared page header/typography container. |

## Open Polish Notes

- Standardize card chrome in dashboard modules to `bg-surface-elevated` + `border-border` for consistent density.
- Replace remaining `text-zinc-*` body copy on high-traffic pages with shared `typography.bodyCopy` where practical.
- Normalize modal/dialog input shells to token-based `surface` + `border` classes.
- Re-check CTA contrast in dark mode where custom indigo styles are still used.

## Accepted Deviations

- Existing branded accents (indigo gradients, status chips) are intentionally retained where they convey semantic state.
- Data-heavy table components keep route-specific micro-typography for scan efficiency.

## Visual QA + Screenshot Gate

- **Current gate state:** 🚫 **Blocked** — browser screenshot tooling is not available in this execution environment, so before/after captures could not be generated.

### Manual QA checklist (use this even if screenshots are blocked)
- Validate **light + dark** for each migrated route:
  - Header: sticky behavior, backdrop blur, border contrast, icon chip alignment.
  - Typography: page title weight/size, description readability, KPI card legibility.
  - Surfaces: consistent card background/border opacity across siblings.
  - Interactions: keyboard focus ring visible on buttons/inputs, hover states not overly jumpy.
  - Contrast: CTAs and destructive actions meet contrast expectations in dark mode.

### When screenshot tooling is available again
- Capture **before/after** for each route group and attach to the PR as a merge gate artifact.
