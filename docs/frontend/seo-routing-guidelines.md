# SEO Routing Guidelines (App Router)

This document defines crawl/index behavior for **non-dashboard routes under `app/`**.

## Policy

- **Marketing/discoverable pages** must be indexable and include page-specific metadata:
  - unique `title`
  - unique `description`
  - `alternates.canonical`
  - `robots: { index: true, follow: true }`
- **Functional/utility pages** must be non-indexable:
  - page metadata must include `alternates.canonical`
  - `robots: { index: false, follow: false }`

## Current route classification (non-dashboard)

| Route pattern | Classification | Robots policy | Notes |
| --- | --- | --- | --- |
| `/` | Marketing/discoverable | `index,follow` | Landing page for product discovery. |
| `/help` | Marketing/discoverable | `index,follow` | Help center entry route. |
| `/help/[slug]` | Marketing/discoverable | `index,follow` | Public documentation articles. |
| `/shop/[slug]` | Marketing/discoverable | `index,follow` | Public shop/service pages for customer discovery. |
| `/login` | Functional/utility | `noindex,nofollow` | Authentication screen. |
| `/invite/[token]` | Functional/utility | `noindex,nofollow` | Tokenized invite acceptance route. |
| `/offline` | Functional/utility | `noindex,nofollow` | PWA/network fallback route. |
| `/open-file` | Functional/utility | `noindex,nofollow` | File-handler import utility route. |
| `/p/[token]` | Functional/utility | `noindex,nofollow` | Private tokenized proposal viewer. |

## Contributor checklist for new non-dashboard pages

1. Decide if route is discoverable marketing content or functional utility.
2. Add explicit page metadata (`title`, `description`, `alternates.canonical`, `robots`).
3. Never rely on inherited generic metadata for public discoverable pages.
4. If route uses secrets/tokens/auth-specific UX, default to `noindex,nofollow`.
