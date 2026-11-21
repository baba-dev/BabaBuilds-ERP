"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { INK, WHITE, contrastRatio, isAccessibleAccent, nearestAccessibleAccent, normalizeHexColor } from "@/lib/invoice-templates/shared/accent-color";

/** Curated, print-safe colours (each has at least 3:1 contrast against white). */
const SWATCHES = ["#0B3D91", "#4F46E5", "#0F766E", "#047857", "#BE123C", "#B45309", "#7E22CE", "#334155"] as const;

export type AccentInheritance = { source: "client" | "workspace" | "design"; hex?: string | null };

const onColour = (hex: string) => (contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK);

/**
 * Brand colour picker for invoices. `value` is the colour set at this level (null = inherit). It shows where an
 * inherited colour comes from, warns when a colour is too light to read on paper, and previews the result.
 */
export function AccentColorField({
  value,
  onChange,
  label,
  hint,
  hideLabel,
  inheritedFrom,
  disabled,
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
  label: string;
  hint?: string;
  /** Keep the label for screen readers only, when a surrounding heading already says it. */
  hideLabel?: boolean;
  inheritedFrom?: AccentInheritance;
  disabled?: boolean;
}) {
  const t = useTranslations("InvoiceAccent");
  const groupId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const chosen = normalizeHexColor(value);
  const tooLight = chosen !== null && !isAccessibleAccent(chosen);
  const readable = chosen ? nearestAccessibleAccent(chosen) : null;
  const inheritedHex = normalizeHexColor(inheritedFrom?.hex);
  const shown = readable ?? inheritedHex;
  const text = draft ?? chosen ?? "";
  const invalidDraft = draft !== null && draft.trim() !== "" && normalizeHexColor(draft) === null;

  const typeHex = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === "") return onChange(null);
    const hex = normalizeHexColor(raw);
    if (hex) onChange(hex);
  };

  return (
    <div className="space-y-3" role="group" aria-labelledby={`${groupId}-label`}>
      <div className={hideLabel ? "sr-only" : undefined}>
        <p id={`${groupId}-label`} className="text-sm font-medium">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>

      <div role="radiogroup" aria-labelledby={`${groupId}-label`} className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((hex) => {
          const selected = chosen === hex;
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t("swatch", { hex })}
              disabled={disabled}
              onClick={() => { setDraft(null); onChange(hex); }}
              style={{ backgroundColor: hex, color: onColour(hex) }}
              className={cn(
                "flex size-8 items-center justify-center rounded-full border border-black/10 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:scale-110 disabled:opacity-50 pointer-coarse:size-11",
                selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
            >
              {selected ? <Check className="size-4" aria-hidden /> : null}
            </button>
          );
        })}
        <label className="relative flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/60 pointer-coarse:size-11">
          <span className="sr-only">{t("custom")}</span>
          <input
            type="color"
            disabled={disabled}
            value={chosen ?? inheritedHex ?? "#0B3D91"}
            onChange={(e) => { setDraft(null); onChange(normalizeHexColor(e.target.value)); }}
            className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span aria-hidden className="size-4 rounded-full bg-[conic-gradient(from_0deg,#ef4444,#eab308,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)]" />
        </label>
        <Input
          value={text}
          onChange={(e) => typeHex(e.target.value)}
          onBlur={() => setDraft(null)}
          disabled={disabled}
          maxLength={9}
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="#0B5FFF"
          aria-label={t("hexLabel")}
          aria-invalid={invalidDraft}
          className="h-9 w-28 font-mono text-xs uppercase pointer-coarse:h-11"
        />
        {value ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setDraft(null); onChange(null); }} className="h-9 gap-1.5 px-2 text-xs pointer-coarse:h-11">
            <RotateCcw className="size-3.5" aria-hidden />
            {inheritedFrom ? t("clear") : t("clearPlain")}
          </Button>
        ) : null}
      </div>

      {invalidDraft ? <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{t("invalid")}</p> : null}

      {tooLight && readable ? (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <span aria-hidden className="size-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: readable }} />
          <span className="min-w-0 flex-1">{t("tooLight")}</span>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { setDraft(null); onChange(readable); }} className="h-7 text-xs pointer-coarse:h-10">{t("useShade")}</Button>
        </div>
      ) : null}

      {!value && inheritedFrom ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {inheritedHex ? <span aria-hidden className="size-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: inheritedHex }} /> : null}
          {t(`inherited.${inheritedFrom.source}`)}
        </p>
      ) : null}

      {shown ? (
        <div className="overflow-hidden rounded-lg border border-border/70" aria-label={t("preview")}>
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs font-semibold" style={{ backgroundColor: shown, color: onColour(shown) }}>
            <span>{t("previewTotal")}</span>
            <span className="tabular-nums">₹18,880.00</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
