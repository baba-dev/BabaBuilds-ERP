# Design System Polish Tweaks (Post-Baseline Migration)

## Scope
This pass applies to the migrated Cash Flow pages and shared Cash Flow primitives. The goal is to improve rhythm and consistency without changing information hierarchy or workflows.

## Accepted Tweaks

### 1) Spacing rhythm in dense cards
**What changed**
- Increased spacing between label → value and value → helper text in metric cards.
- Increased inter-block spacing in the cash flow page shell header area.
- Added a slightly roomier internal padding token for high-density cards (`18px` instead of strict `16px`).

**Why**
- Migrated cards had compressed vertical rhythm, especially when helper text appeared.
- Slightly larger spacing improves scanability and reduces accidental visual grouping.

**Examples**
- `CashFlowMetricCard`: `mt-2` → `mt-2.5` (value), `mt-1.5` → `mt-2` (helper text), `p-4` → `p-[18px]`.
- `CashFlowPageShell`: section spacing `space-y-6` → `space-y-7`, nav/action block `space-y-3` → `space-y-4`.

### 2) Border opacity + shadow normalization
**What changed**
- Unified card border alpha around `/55` for neutral surfaces.
- Reduced ad-hoc contrast jumps by aligning tinted surfaces to lower opacity.
- Replaced mixed `shadow-sm`/`hover:shadow-md` with a consistent low-elevation base and soft hover elevation.

**Why**
- Before this pass, cards with similar semantic weight had visibly different contrast and depth.
- Consistent elevation makes layout hierarchy clearer and calmer.

**Examples**
- `CashFlowMetricCard` and `CashFlowInsightCard` now use:
  - Base shadow: `shadow-[0_1px_2px_rgba(15,23,42,0.06)]`
  - Hover shadow: `hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)]`
- Tone backgrounds reduced from `.../40` to `.../30` (or similar) for non-critical content surfaces.

### 3) Reduced visual noise (gradients + accent restraint)
**What changed**
- Capped hero gradient glow intensity in the overview snapshot block.
- Reduced accent-heavy backgrounds on nested summary cards.
- Kept strong accent treatments focused on meaning-bearing UI (primary actions and risk states), not passive containers.

**Why**
- Dense screens already carry semantic color through risk tones and badges.
- Lower ambient gradients and muted non-critical fills reduce distraction.

**Examples**
- Overview glow reduced:
  - `bg-indigo-500/5` → `bg-indigo-500/4` (dark: `/10` → `/8`)
  - `bg-emerald-500/5` → `bg-emerald-500/4` (dark: `/10` → `/8`)
- Overview summary tiles shifted from `bg-white/60` to `bg-white/50` with matched border alpha.

### 4) Icon sizing + optical weight alignment
**What changed**
- Normalized page header icons across migrated Cash Flow pages from `20px` to optically balanced `18px`.
- Normalized small utility/action icons to `15px` for better text/icon proportion in compact rows.
- Standardized insight-card icon container to fixed `32px` square and normalized child SVG sizing.

**Why**
- Inconsistent icon sizes made similar affordances feel mismatched in weight.
- Fixed icon containers and consistent glyph size improve row alignment and scanning speed.

**Examples**
- Header icons: `h-5 w-5 text-indigo-500` → `h-[18px] w-[18px] text-indigo-500/90`.
- Action/help icons (`RefreshCw`, `Info`, alert row icons): `h-4 w-4` → `h-[15px] w-[15px]`.
- Insight icon wrapper: fixed `h-8 w-8` and `[&_svg]:h-4 [&_svg]:w-4`.

## Non-goals in this pass
- No layout rewrites.
- No copy/content changes.
- No business-logic changes.
- No token framework refactor beyond tactical style normalization.

## Validation checklist used
- Visual comparison for card rhythm (label/value/helper).
- Contrast consistency check across sibling cards.
- Accent usage audit (strong accent reserved for high-value actions + critical/warning states).
- Icon row/header alignment pass for mixed icon/text controls.
