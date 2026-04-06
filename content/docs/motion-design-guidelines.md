---
title: "Motion Design Guidelines"
description: "Animation standards for landing and pricing surfaces with accessibility-first defaults."
order: 8
---

# Motion Design Guidelines

This document defines the approved motion system for BabaBuilds ERP marketing surfaces.

## 1) Allowed animation types

Use motion only to improve orientation, hierarchy, and perceived quality:

- **Entrance / reveal**: fade + translateY (small, 8–24px)
- **Micro-interactions**: hover scale, button press feedback, focus halo transitions
- **Progress indicators**: width/value transitions for comparison cues
- **Decorative ambient loops**: low-amplitude floating glows or gradient drift
- **Marquee/logo cloud movement**: continuous horizontal movement for trust/social proof rows

Avoid:

- large parallax shifts tied to scroll velocity
- aggressive bounce/elastic effects on primary content
- motion that blocks reading flow or causes layout jumps

## 2) Durations and easing

### Standard durations

- **Fast (micro state)**: `120ms – 180ms`
- **Default UI transitions**: `200ms – 280ms`
- **Section reveal**: `320ms – 450ms`
- **Ambient decorative loops**: `8s – 16s` (infinite, subtle)

### Approved easing curves

- **Standard exit/enter**: `easeOut`
- **Ambient loops**: `easeInOut`
- **Linear only** for continuous marquee movement

### Stagger rules

- card/list stagger delay: `40ms – 90ms`
- never exceed `400ms` total reveal delay for above-the-fold content

## 3) Reduced-motion fallback rules

When `prefers-reduced-motion: reduce` is active:

1. **Disable looping ambient animations** (glows, decorative orbiting, marquee).
2. **Keep content readable without animation** (no hidden initial states).
3. **Use instant or near-instant state changes** (`0ms – 80ms`) for non-essential transitions.
4. **Preserve semantic feedback** with color, border, and text changes instead of movement.
5. **Never rely on animation only** to convey pricing or plan differences.

## 4) Contrast and readability guardrails

- Maintain legible text contrast in both light and dark themes while animating backgrounds.
- Avoid placing critical copy over moving high-contrast textures.
- Decorative layers must remain behind content and use low opacity.

## 5) Performance guardrails

- Lazy-load heavy decorative animation modules.
- Prefer `transform` and `opacity` animations over layout properties.
- Keep animated node count small above the fold.
- Pause or remove non-essential motion for reduced-motion users.
