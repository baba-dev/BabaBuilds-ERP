# GCC Support Matrix (Marketing Governance)

## Purpose

Use this matrix as the single source of truth before publishing country-level claims for Oman and GCC markets.  
No landing, SEO, ad, or sales copy should claim country readiness unless status here is `Marketing-safe now`.

## Country tiers

- **Marketing-safe now**: Country-aware setup + currency handling + structured compliance pack + region-appropriate payment path + no major legal copy mismatch.
- **Limited/fallback**: Country-aware setup exists, but compliance or legal output is still generic/fallback.
- **In-progress**: Core elements are being built; do not use direct readiness language publicly.

## Current GCC status

| Country | Country-aware setup | Compliance pack | Invoice legal wording | Payment path | Status | Claim guidance |
|---|---|---|---|---|---|---|
| Oman (OM) | Yes | Yes (VAT baseline) | Neutral VAT wording | Stripe (global) | Marketing-safe now | Use “country-aware VAT defaults and configurable rates”. Avoid authority-specific filing claims. |
| United Arab Emirates (AE) | Yes | Yes (VAT baseline) | Neutral VAT wording | Stripe (global) | Marketing-safe now | Use “UAE VAT setup defaults and configurable tax workflows”. |
| Saudi Arabia (SA) | Yes | Yes (VAT baseline) | Neutral VAT wording | Stripe (global) | Marketing-safe now | Use “Saudi VAT defaults”; avoid claiming full ZATCA filing automation unless implemented. |
| Qatar (QA) | Yes | Yes (VAT baseline) | Neutral VAT wording | Stripe (global) | Limited/fallback | Use “country-aware setup and configurable tax rates”. |
| Bahrain (BH) | Yes | Yes (VAT baseline) | Neutral VAT wording | Stripe (global) | Limited/fallback | Use “country-aware setup and configurable tax rates”. |
| Kuwait (KW) | Yes | Yes (VAT baseline) | Neutral VAT wording | Stripe (global) | Limited/fallback | Use “country-aware setup and configurable tax rates”. |

## Release checklist for geo claims

Before shipping Oman/GCC marketing updates:

1. Verify country exists in `lib/geography.ts` with correct currency and locale.
2. Verify country has an explicit pack in `lib/tax/compliance-packs.ts`.
3. Verify invoice output language is jurisdiction-appropriate in `lib/pdf/generator.ts`.
4. Verify payment recommendation is consistent (Razorpay India-only, Stripe global).
5. Verify landing/docs wording matches matrix tier.
6. Verify this matrix status is updated in the same PR as claim changes.
