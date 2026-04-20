# Phase 1 Conversion Dashboard Spec

## Goal
Measure conversion quality across the new homepage + persona funnel and demo-first flow.

## Event sources
- `marketing_trial_cta_clicked`
- `marketing_demo_clicked`
- `marketing_demo_role_clicked`
- `interactive_demo_click`
- `interactive_demo_provisioned`

All events are emitted through:
- `lib/marketing-analytics.ts`

## Dimensions to capture
- `source` (hero, final_cta, navbar, mobile_navbar, persona_page)
- `label` (button copy)
- `role` (CA/Agency/Contractor template role or templateKey)
- `templateKey` (dm_agency, tax_agency, contractor_builder, freelancer_consultant, software_company)
- `context` (role card surface / persona route)

## Core KPIs
1. Trial CTA CTR
   - Formula: `marketing_trial_cta_clicked / landing_page_sessions`
2. Interactive Demo CTR
   - Formula: `marketing_demo_clicked / landing_page_sessions`
3. Role Selection Rate
   - Formula: `marketing_demo_role_clicked / marketing_demo_clicked`
4. Demo Provision Success Rate
   - Formula: `interactive_demo_provisioned / interactive_demo_click`
5. Demo-to-Trial Transition Rate
   - Formula: `trial_clicks_from_demo_context / interactive_demo_provisioned`
6. Persona-to-Trial Conversion
   - Formula: `trial_clicks_from_persona_pages / persona_page_sessions`

## Dashboard slices
- By route:
  - `/`
  - `/for-ca`
  - `/for-agencies`
  - `/for-contractors`
  - `/for-small-businesses`
  - `/for-freelancers`
- By role/template key
- By device class (desktop/mobile)
- By locale (`en-IN`, `hi`, `ar`, `es`)

## Suggested panels
1. Funnel (Sessions -> Demo Click -> Role Selected -> Demo Provisioned -> Trial Click)
2. CTA performance by source surface
3. Persona page performance table
4. Role card performance table
5. Locale-wise conversion heatmap
6. Error monitor (demo click without provision success)

## Alert thresholds (initial)
- Demo Provision Success Rate < 85% (15-minute window)
- Trial CTA CTR drops > 20% versus 7-day baseline
- Persona page bounce > 75% for any `/for-*` page

## Query checklist
- Ensure bot traffic is excluded
- Session identity should be stable per visit
- Deduplicate rapid repeat clicks within 2 seconds for CTA counts
