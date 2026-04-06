---
title: "Motion Design Guidelines"
description: "Approved product UI motion patterns with accessibility-first defaults for dashboard experiences."
order: 8
---

# Motion Design Guidelines

This document defines the approved motion system for BabaBuilds ERP product UI surfaces, especially dashboard workflows.

## 1) Motion token system (source of truth)

Use global motion tokens from `app/globals.css`:

- **Durations**
  - `--motion-duration-fast` (`150ms`) for hover/focus/row-feedback
  - `--motion-duration-base` (`220ms`) for button/card/modal transitions
  - `--motion-duration-slow` (`320ms`) for larger, non-blocking transitions
- **Easing**
  - `--motion-ease-standard` for most interaction changes
  - `--motion-ease-emphasized` for modal/card emphasis
  - `--motion-ease-linear` for continuous movement only
- **Interaction constants**
  - `--motion-hover-lift-y` for subtle card elevation
  - `--motion-press-scale` for press feedback

Do not hardcode ad-hoc timings/easing in feature pages when a token exists.

## 2) Approved interaction patterns

### Buttons

- Use shared button primitives (they include standardized feedback timing).
- Keep press feedback subtle and fast.
- Focus-visible state must remain obvious and never be removed.

### Row hover (tables/lists)

- Use low-contrast background shifts for row hover.
- Prefer color/background transitions; avoid movement on dense rows.

### Card hover

- Use light lift (`translateY`) + soft shadow/background response.
- Motion should suggest interactivity, not feel like draggable movement.

### Modal open/close

- Keep overlays quick and unobtrusive.
- Content transitions should be slightly emphasized but short enough to avoid blocking user flow.

## 3) Utility classes to reuse

Use these shared classes instead of custom one-off animation stacks:

- `motion-feedback`
- `motion-feedback-fast`
- `motion-hover-lift`
- `motion-press`
- `motion-row-hover`
- `motion-modal-overlay`
- `motion-modal-content`
- `dashboard-motion-surface` (scope-level normalization for dashboard UI primitives)

## 4) Reduced-motion requirements (app-wide)

When `prefers-reduced-motion: reduce` is active:

1. Reduce all animation/transition durations to near-instant values.
2. Remove transform-based hover/press/lift motion.
3. Disable looping decorative animation.
4. Preserve state communication via color, border, iconography, and copy.
5. Ensure no flow depends on motion to be understandable.

## 5) Anti-patterns (do not ship)

- Mixed, arbitrary durations/easing across similar controls in the same view.
- Large movement for routine hover states (cards, rows, form controls).
- Long modal animations that delay form/input readiness.
- Relying on motion alone for validation, status, or financial state changes.
- Ignoring reduced-motion support on newly added components.

## 6) Review checklist

Before merge:

- [ ] Uses motion tokens/utilities (not bespoke timings) for product UI interactions.
- [ ] Buttons, rows, cards, and modals feel consistent across dashboard pages.
- [ ] Reduced-motion behavior verified at app level.
- [ ] Interaction feedback remains clear without movement.
