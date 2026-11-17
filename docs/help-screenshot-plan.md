# Product and Help screenshot workflow

The product image library is generated from the live demo experience, not assembled by hand. This keeps the README, Help Center, brochure, and future operations manual tied to the same current route map.

## Capture standard

- Use the seeded **Software Company** demo only.
- Capture every route in both light and dark mode at 1440×900.
- Keep the desktop sidebar visible where it provides navigation context.
- Wait for the page shell and requested theme, dismiss onboarding overlays, and reject blank images.
- Store full-resolution masters in `docs/product-images/screenshots/<theme>/`.
- Use stable, descriptive filename stems such as `proposals_pipeline.png` and `settings_security.png`.
- Never capture a customer workspace, real email address, access token, uploaded document, or production balance.

## Route coverage

`docs/sales-brochure/brochure-routes.ts` is the reviewed route manifest. It covers:

1. Public marketing, sign-in, Help, reseller, privacy, and terms pages.
2. Core workspace navigation and all enabled demo modules.
3. Important secondary pages such as purchase orders, reconciliation import, workforce reports, and security settings.
4. Seed-dependent proposal, payroll, and storefront detail pages resolved through the demo APIs.

When a page moves, update the route manifest first. Do not keep an obsolete path alive only for a screenshot.

## Refresh and verify

```bash
npm run product-images:capture
```

After capture:

1. Confirm `docs/product-images/manifest.json` contains a light and dark path for every entry.
2. Open a representative sample from every section and inspect text legibility, loading state, overlays, and synthetic data.
3. Run the documentation reference check and the normal fast CI gate.
4. Rebuild the sales brochure only after the canonical image library is approved.

## Writing guidance for Help articles

- Start with the outcome the reader is trying to achieve.
- Use the exact current navigation label and route.
- Keep steps short, numbered, and observable: say what to select and what success looks like.
- Explain irreversible or financially meaningful actions before the step that performs them.
- Add troubleshooting beside the step where a reader is likely to get stuck.
- Use one current overview image when it adds orientation. Add action-state images only when they show information that words cannot convey clearly.
