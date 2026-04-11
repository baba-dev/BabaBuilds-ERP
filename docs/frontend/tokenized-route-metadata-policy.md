# Tokenized Route Metadata Policy

This policy applies to any tokenized private route, including current routes like:

- `/invite/[token]`
- `/p/[token]`
- Future routes with the same pattern (for example `/invoices/public/[token]`)

## Required metadata rules

1. **Do not set `alternates.canonical`** on tokenized routes.
2. **Always set robots to blocked indexing/crawling**:
   - `robots.index = false`
   - `robots.follow = false`
3. **Titles and descriptions must stay generic**:
   - Never include the token value.
   - Never include sensitive/private details that are specific to the shared resource.

## Implementation standard

Use the shared helper `getTokenizedPrivatePageMetadata` from:

- `lib/metadata/tokenized-private-page.ts`

All new tokenized private pages should call this helper from `generateMetadata` to enforce these rules consistently.
