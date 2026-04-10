# Visual QA Checklist

Use this checklist before promoting frontend updates between rollout phases.

## Delivery control metadata

| Item | Owner | Status | Dependencies | Release Phase |
|---|---|---|---|---|
| QA process governance and sign-off | Frontend Platform | In progress | Component adoption matrix maintenance | Phase 1 |
| Design QA automation hooks | QA Engineering | Planned | Stable selectors and fixture data | Phase 2 |
| Post-release visual monitoring | SRE + Frontend Platform | Planned | Baseline screenshot set and alert thresholds | Phase 3 |

## Core visual and interaction checks

| Check | What to verify | Owner | Status | Dependencies | Release Phase |
|---|---|---|---|---|---|
| Light / dark parity | All key surfaces, text, borders, charts, and overlays render consistently in both themes. | Design Systems | In progress | Theme tokens finalized and consumed consistently | Phase 1 |
| Responsive breakpoints | Layout and spacing remain usable at mobile, tablet, desktop, and ultra-wide breakpoints. | Frontend Platform | In progress | Shared breakpoint definitions and container rules | Phase 1 |
| Reduced-motion behavior | Animations honor `prefers-reduced-motion` and preserve clarity without motion cues. | Accessibility Lead | Planned | Motion tokenization and animation wrapper adoption | Phase 2 |
| Loading states | Skeletons/spinners appear promptly and match page hierarchy without layout shift. | Feature Teams | Planned | Loading component primitives and suspense boundaries | Phase 2 |
| Empty states | Empty collections/messages are informative and include clear next actions. | Product UI Team | Planned | Content design approval and CTA standards | Phase 2 |
| Error states | Recoverable and fatal error states are distinct, readable, and action-oriented. | Product UI Team | Planned | Error boundary conventions and copy guidelines | Phase 2 |
| Keyboard focus | Tab order is logical, visible focus indicators pass contrast, and traps are avoided. | Accessibility Lead | In progress | Focus ring token and keyboard test scripts | Phase 1 |
| Icon-only controls accessibility | Icon-only buttons/links include meaningful `aria-label` + `title`; disclosure toggles set `aria-expanded` and `aria-controls` to expose state and relationship. | Accessibility Lead | In progress | Shared button patterns and lint/checklist enforcement | Phase 1 |
| Contrast checks | Text, iconography, chart series, and UI states meet contrast requirements. | Accessibility Lead | In progress | Approved palette and semantic color mappings | Phase 1 |

## Suggested QA cadence by phase

- **Phase 1:** Run parity + responsiveness + keyboard/contrast checks on every merge candidate.
- **Phase 2:** Add loading/empty/error and reduced-motion checks to release gates.
- **Phase 3:** Require all checks plus regression snapshots for advanced pages (maps/charts/admin).

## Regression checks for interactive state styling (hotspot audit)

Run these checks whenever interactive classnames are touched in high-traffic UI surfaces:

- Verify **hover + focus-visible + disabled** states for each interactive control in:
  - `components/AuthModal.tsx`
  - `components/AIChatbot.tsx`
  - `components/PricingSection.tsx`
  - `app/help/HelpSidebar.tsx`
  - `components/notifications/NotificationBell.tsx`
- Confirm all keyboard-focusable controls show a visible ring with `focus-visible:ring-2` and `focus-visible:ring-offset-2`.
- Confirm ring color family is consistent per surface:
  - Indigo family for auth, pricing, help center, and notifications.
  - Purple family for chatbot surface controls.
- Confirm disabled controls use reduced opacity and blocked pointer intent (`disabled:opacity-*` + `disabled:pointer-events-none`) where controls can be disabled.
- Validate in both themes:
  - Light mode ring offsets match light surfaces (`ring-offset-white`/`ring-offset-zinc-100`).
  - Dark mode ring offsets match dark surfaces (`dark:ring-offset-zinc-900`/`dark:ring-offset-zinc-950`).
