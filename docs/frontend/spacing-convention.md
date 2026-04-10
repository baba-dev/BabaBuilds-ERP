# Frontend Spacing Convention (Lightweight)

This document defines a lightweight spacing baseline for dashboard/help surfaces.

## 1) Page padding

Use consistent page gutters on primary app screens:

- **Mobile:** `px-4 py-6`
- **Desktop (`md+`):** `md:px-8 md:py-8`

Use a centered width wrapper when needed (for example `max-w-4xl`, `max-w-7xl`) and let that wrapper control vertical rhythm via `space-y-*`.

## 2) Section gaps

Prefer parent-managed spacing over child margins:

- **Primary section stack:** `space-y-8`
- **Secondary stack inside a section/card:** `space-y-6`
- **Compact stack for labels/meta text:** `space-y-2` or `space-y-1.5`

Guideline:

- Prefer `gap-*` / `space-y-*` on layout parents.
- Avoid per-child `mt-*` / `mb-*` unless there is a clear visual reason (e.g., decorative overlap, sticky affordance offset).

## 3) Card inner spacing tiers

Standardize internal card padding and content spacing:

- **Card content default:** `p-6`
- **Compact card content:** `p-4`
- **Dense controls/meta rows:** `gap-2` to `gap-4`

If `CardHeader` uses a divider (`border-b`), keep body padding independent (`p-6`) instead of ad-hoc top-only padding (`pt-*`) unless intentionally required.

## 4) One-off values policy

Avoid one-off spacing values (examples: `mb-10`, `pb-2.5`, `mt-2.5`) in default screen layouts.

Use scale steps from the default spacing system first (`1, 1.5, 2, 3, 4, 6, 8, 10, 12`). Keep custom spacing only when tied to explicit visual rationale.
