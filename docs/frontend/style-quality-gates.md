# Style quality gates baseline

This document defines minimum UI quality gates to keep the new visual baseline consistent across future work.

## 1) Minimum contrast targets (light + dark)

These targets apply in both light and dark themes unless noted. Ratios are WCAG contrast ratios.

| UI role | Minimum | Applies to | Implementation notes |
|---|---:|---|---|
| Body text | **4.5:1** | Paragraphs, table text, form labels, text in cards | Use default text roles (`--foreground`, typography `bodyCopy` / `cardBody`) on base surfaces. |
| Helper text | **4.5:1** | Assistive/descriptive copy, hints, captions | Helper text is usually small (`text-xs` / `text-sm`), so keep AA normal-text threshold in both themes. |
| Badge text + icon | **4.5:1** | Badge label/icon vs badge fill | For outlined badges, border/surface separation must also reach **3:1**. |
| Interactive control labels | **4.5:1** | Button/link/input label text in default/hover/active/disabled | Text must remain readable in each state, not only default. |
| Interactive control boundaries | **3:1** | Inputs, buttons, toggles, checkbox/switch outlines, disabled boundaries | Applies to non-text contrast (component edge vs adjacent surface). |
| Focus indicator | **3:1** | Focus-visible ring vs surrounding surface | Ring must remain visible with ring offset in both themes. |

### Required token pairs to validate

- **Light theme:** `--foreground` on `--background`, `--muted-foreground` on `--muted`, focus ring (`--focus-ring` / ring utilities) on `--background`.
- **Dark theme:** `--foreground` on `--background`, `--muted-foreground` on `--muted`, focus ring on dark elevated/base surfaces.

## 2) Canonical state audit matrix

Use this matrix when building or reviewing component states.

| State | Canonical visual language | Required checks |
|---|---|---|
| Disabled | Reduced emphasis (`disabled:opacity-50`), no interactive pointer behavior | Label remains readable, boundary still perceivable (3:1), no hover affordance leaks through. |
| Error | `destructive` palette with consistent border/text/ring treatment | Message text contrast >= 4.5:1, input and helper/error pairings are visually connected. |
| Warning | Amber/yellow semantic treatment with clear icon + text pairing | Avoid warning colors that drop below 4.5:1 on light surfaces. |
| Success | Green semantic treatment with clear icon + text pairing | Ensure success chip/badge and supporting text maintain 4.5:1. |
| Loading | Skeleton/spinner plus stable layout and label context | Loading state preserves hierarchy and avoids layout shift. |
| Empty | Calm neutral container + explicit next action | Empty copy uses body/helper text roles and clear primary action affordance. |

## 3) Typography role usage

Use approved roles from `lib/ui/typography.ts` for canonical hierarchy:

- `pageTitle`
- `sectionHeader`
- `cardTitle`
- `bodyCopy`
- `cardBody`

Avoid ad hoc typography class stacks for primary page hierarchy unless a role is missing and explicitly introduced.

## 4) Reference gallery

Canonical examples are available at internal route:

- `/admin/style-gallery`

The page shows light/dark samples for badges, interactive controls, typography roles, and state treatments (disabled, error, warning, success, loading, empty).
