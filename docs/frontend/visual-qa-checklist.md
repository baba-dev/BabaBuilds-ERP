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

## Responsive hotspot QA log (2026-04-10)

Validated target hotspots at **360, 390, 768, 820, 1024** widths:

- `components/AIChatbot.tsx`
- `app/help/HelpSidebar.tsx`
- `app/(dashboard)/reconciliation/page.tsx`

### Findings and outcomes

| Hotspot | Check | Finding | Outcome |
|---|---|---|---|
| AI Chatbot | Overlay stacking and dismissal | Expanded modal overlay behavior was already dismissible, but header icon controls were below common 44px touch-target guidance on small screens. | Increased mobile touch-target sizes for clear / expand / close controls to `40x40` (retaining compact desktop sizing). |
| Help Sidebar | Overlay stacking and dismissal | Mobile drawer overlay could be obscured by other fixed overlays/components with higher z-index; close control was small for thumb use. | Raised mobile drawer overlay stack level and increased close button to `40x40`; added drawer relationship semantics (`aria-controls`, `aria-expanded`). |
| Reconciliation page | Horizontal overflow in tab/control rows | Tab controls were set to horizontal scrolling (`overflow-x-auto`) and could feel cramped at narrow widths. | Refactored tab row to wrap with minimum per-tab width and 44px minimum height; reduced horizontal padding and enabled multi-line distribution. |
| Reconciliation page | Touch targets and control density | Finalize action could crowd header content on narrow viewports. | Made finalize CTA full-width on mobile and preserved inline desktop layout for readability/tap reliability. |
| Reconciliation page | Header compression | Title + status badge could compress awkwardly at smaller widths. | Enabled title cluster wrapping to prevent overflow/collision. |

### Repeatable QA steps for future runs

1. At each target width (360, 390, 768, 820, 1024), open all overlays/drawers and verify:
   - backdrop appears above page content,
   - tap/click outside dismisses correctly,
   - close controls remain visible and tappable.
2. Check all icon-only controls in hotspot headers are at least 40px square on mobile and remain keyboard-focusable.
3. Confirm tab/control groups do not require horizontal scroll unless intentional; prefer wrapping/stacking first.
4. Re-test dark mode after responsive adjustments to ensure active/inactive control contrast remains clear.
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
