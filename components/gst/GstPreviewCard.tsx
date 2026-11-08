"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { AlertTriangle, Info, Landmark, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { GST_STATES, FOREIGN_POS, stateName } from "@/lib/gst/states";
import type { GstPreview, PreviewWarningCode } from "@/lib/gst/source";

export type GstPreviewLine = {
  description?: string;
  amount: number;
  quantity?: number;
  /** Percent; omit to let the server use the SAC code's rate. */
  ratePercent?: number | null;
  sacCode?: string | null;
  goods?: boolean;
  productId?: string | null;
  serviceTemplateId?: string | null;
};

export type GstOverrides = { placeOfSupply?: string | null; supplyOverride?: "SEZ_WP" | "SEZ_WOP" | null; reverseCharge?: boolean | null };

/** Debounced call to /api/gst/preview. Returns null until the first answer, and keeps the last answer while refreshing. */
export function useGstPreview(args: { clientId: string | null; lines: GstPreviewLine[]; overrides?: GstOverrides; exchangeRate?: number | null; enabled?: boolean }) {
  const { clientId, lines, overrides, exchangeRate, enabled = true } = args;
  const [preview, setPreview] = useState<GstPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useMemo(() => JSON.stringify({ clientId, lines, overrides, exchangeRate }), [clientId, lines, overrides, exchangeRate]);
  const latest = useRef(0);

  useEffect(() => {
    if (!enabled || !clientId || lines.length === 0) {
      setPreview(null);
      return;
    }
    const id = ++latest.current;
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch("/api/gst/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          lines: lines.map((l) => ({ description: l.description, amount: l.amount, quantity: l.quantity, ratePercent: l.ratePercent ?? null, sacCode: l.sacCode ?? null, goods: l.goods, productId: l.productId ?? null, serviceTemplateId: l.serviceTemplateId ?? null })),
          overrides: overrides ? { placeOfSupply: overrides.placeOfSupply ?? null, supplyOverride: overrides.supplyOverride ?? null, reverseCharge: overrides.reverseCharge ?? null } : undefined,
          exchangeRate: exchangeRate && exchangeRate > 0 ? exchangeRate : undefined,
        }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (id === latest.current) setPreview(d?.preview ?? null);
        })
        .catch(() => undefined)
        .finally(() => {
          if (id === latest.current) setLoading(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // `key` captures every input; the object identities change on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { preview, loading };
}

type Props = {
  preview: GstPreview | null;
  loading?: boolean;
  format: (n: number) => string;
  overrides?: GstOverrides;
  onOverridesChange?: (next: GstOverrides) => void;
  clientId?: string | null;
  className?: string;
};

const TONE: Partial<Record<PreviewWarningCode, "info">> = { EXPORT: "info", SEZ: "info", REVERSE_CHARGE: "info", TAX_EXEMPT_CLIENT: "info" };
const FIX_LINK: Partial<Record<PreviewWarningCode, string>> = {
  SUPPLIER_STATE_MISSING: "/tax",
  CLIENT_STATE_MISSING: "/clients",
  GSTIN_INVALID: "/clients",
  GSTIN_STATE_MISMATCH: "/clients",
  SEZ_NEEDS_GSTIN: "/clients",
  TAX_EXEMPT_CLIENT: "/clients",
};

export function GstPreviewCard({ preview, loading = false, format, overrides, onOverridesChange, className }: Props) {
  const t = useTranslations("GstSource");
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (!preview || !preview.applicable) return null;

  const placeLabel = preview.placeOfSupply === FOREIGN_POS ? t("outsideIndia") : `${preview.placeOfSupply} · ${stateName(preview.placeOfSupply)}`;
  const rows: Array<[string, number]> = preview.interState
    ? [[t("igst"), preview.split.igst]]
    : [[t("cgst"), preview.split.cgst], [t("sgst"), preview.split.sgst]];
  const adjustable = !!onOverridesChange;
  const set = (patch: GstOverrides) => onOverridesChange?.({ ...overrides, ...patch });

  return (
    <section aria-label={t("title")} className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Landmark className="size-4 text-emerald-600" aria-hidden />{t("title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t(`supply.${preview.supplyType}`)}</span> · {t("placeOfSupply")}: {placeLabel} · {preview.interState ? t("inter") : t("intra")}
          </p>
        </div>
        {adjustable ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="size-3.5" aria-hidden />{t("adjust")}
          </button>
        ) : null}
      </div>

      <dl className={cn("mt-3 space-y-1 text-sm transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        <div className="flex justify-between"><dt className="text-muted-foreground">{t("taxable")}</dt><dd className="tabular-nums">{format(preview.taxable)}</dd></div>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{format(value)}</dd></div>
        ))}
        <div className="flex justify-between border-t border-border/60 pt-1 font-semibold"><dt>{t("total")}</dt><dd className="tabular-nums">{format(preview.total)}</dd></div>
      </dl>

      <AnimatePresence initial={false}>
        {open && adjustable ? (
          <motion.div initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">
                {t("overrides.placeOfSupply")}
                <select value={overrides?.placeOfSupply ?? ""} onChange={(e) => set({ placeOfSupply: e.target.value || null })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  <option value="">{t("overrides.auto")}</option>
                  <option value={FOREIGN_POS}>{t("outsideIndia")}</option>
                  {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                {t("overrides.sez")}
                <select value={overrides?.supplyOverride ?? ""} onChange={(e) => set({ supplyOverride: (e.target.value || null) as GstOverrides["supplyOverride"] })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  <option value="">{t("overrides.sezNone")}</option>
                  <option value="SEZ_WP">{t("overrides.sezWp")}</option>
                  <option value="SEZ_WOP">{t("overrides.sezWop")}</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2">
                <input type="checkbox" checked={!!overrides?.reverseCharge} onChange={(e) => set({ reverseCharge: e.target.checked })} className="size-4 rounded border-border" />
                {t("overrides.reverse")}
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("overrides.hint")}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {preview.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {preview.warnings.map((w) => {
            const info = TONE[w.code] === "info";
            const href = FIX_LINK[w.code];
            return (
              <motion.li key={`${w.code}-${w.line ?? ""}`} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs", info ? "bg-sky-500/10 text-sky-800 dark:text-sky-200" : "bg-amber-500/10 text-amber-900 dark:text-amber-200")}>
                {info ? <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                <span>
                  {t(`warn.${w.code}`, { line: (w.line ?? 0) + 1 })}{" "}
                  {href && !info ? <Link href={href} className="font-semibold underline underline-offset-2">{t("fix")}</Link> : null}
                </span>
              </motion.li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
