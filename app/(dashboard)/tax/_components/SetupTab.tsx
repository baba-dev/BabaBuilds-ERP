"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { GST_STATES } from "@/lib/gst/states";
import { readError, Section, useJson } from "./gst-utils";

type Settings = {
  gstin: string | null; stateCode: string | null; registrationType: "REGULAR" | "COMPOSITION" | "UNREGISTERED"; filingFrequency: "MONTHLY" | "QRMP";
  prevTurnover: number; registeredFrom: string | null; lutActive: boolean; hasProfile: boolean; companyName: string;
};

export function SetupTab({ onSaved }: { onSaved: () => void }) {
  const { data, error, reload } = useJson<Settings>("/api/gst/settings");
  if (error && !data) return <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>;
  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  return <SetupForm initial={data} onSaved={() => { reload(); onSaved(); }} />;
}

function SetupForm({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const t = useTranslations("GstHub.setup");
  const [gstin, setGstin] = useState(initial.gstin ?? "");
  const [state, setState] = useState(initial.stateCode ?? "");
  const [reg, setReg] = useState(initial.registrationType);
  const [freq, setFreq] = useState(initial.filingFrequency);
  const [turnover, setTurnover] = useState(initial.prevTurnover ? String(initial.prevTurnover) : "");
  const [since, setSince] = useState(initial.registeredFrom ?? "");
  const [lut, setLut] = useState(initial.lutActive);
  const [busy, setBusy] = useState(false);

  const normalized = normalizeGstin(gstin);
  const check = normalized.length === 15 ? validateGstin(normalized) : null;
  const effectiveState = check && check.valid ? check.stateCode : state;
  const registered = reg !== "UNREGISTERED";

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/gst/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gstin: normalized || null, stateCode: effectiveState || null, registrationType: reg, filingFrequency: reg === "REGULAR" ? freq : "MONTHLY",
          prevTurnover: turnover.trim() === "" ? null : Number(turnover), registeredFrom: since || null, lutActive: lut,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, t("failed")));
      toast.success(t("saved"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {!initial.hasProfile ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("noProfile")}</p> : null}
      <Section title={t("registration")} hint={t("registrationHint")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="gstin">{t("gstin")}</Label>
            <div className="relative">
              <Input id="gstin" value={gstin} maxLength={15} autoCapitalize="characters" spellCheck={false} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="27AAPFU0939F1ZV" className="pe-10 font-mono tracking-wider" aria-invalid={check ? !check.valid : undefined} aria-describedby="gstin-hint" disabled={!registered} />
              {check ? (check.valid ? <CheckCircle2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-emerald-500" aria-hidden /> : <XCircle className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-rose-500" aria-hidden />) : null}
            </div>
            <p id="gstin-hint" className={cn("text-xs", check && !check.valid ? "text-rose-600" : "text-muted-foreground")}>
              {check && !check.valid ? t(`gstinError.${check.reason}`) : check && check.valid ? t("gstinOk", { pan: check.pan }) : t("gstinHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("state")}</Label>
            <Select value={effectiveState || undefined} onValueChange={setState} disabled={!!(check && check.valid) || !registered}>
              <SelectTrigger aria-label={t("state")}><SelectValue placeholder={t("statePlaceholder")} /></SelectTrigger>
              <SelectContent>{GST_STATES.map((s) => <SelectItem key={s.code} value={s.code}>{s.code} · {s.name}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{check && check.valid ? t("stateFromGstin") : t("stateHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("type")}</Label>
            <Select value={reg} onValueChange={(v) => setReg(v as Settings["registrationType"])}>
              <SelectTrigger aria-label={t("type")}><SelectValue /></SelectTrigger>
              <SelectContent>{(["REGULAR", "COMPOSITION", "UNREGISTERED"] as const).map((k) => <SelectItem key={k} value={k}>{t(`types.${k}`)}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`typeHint.${reg}`)}</p>
          </div>
        </div>
      </Section>

      {reg === "REGULAR" ? (
        <Section title={t("filing")} hint={t("filingHint")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["MONTHLY", "QRMP"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setFreq(k)} aria-pressed={freq === k} className={cn("rounded-2xl border p-4 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", freq === k ? "border-indigo-500 bg-indigo-50/60 shadow-sm dark:bg-indigo-500/10" : "border-border/70 hover:border-indigo-300")}>
                <span className="block text-sm font-semibold">{t(`freq.${k}`)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{t(`freqHint.${k}`)}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t("business")} hint={t("businessHint")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="turnover">{t("turnover")}</Label>
            <Input id="turnover" inputMode="decimal" value={turnover} onChange={(e) => setTurnover(e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">{t("turnoverHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="since">{t("since")}</Label>
            <Input id="since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-3.5 sm:col-span-2">
            <div><p className="text-sm font-medium">{t("lut")}</p><p className="text-xs text-muted-foreground">{t("lutHint")}</p></div>
            <Switch checked={lut} onCheckedChange={setLut} aria-label={t("lut")} />
          </div>
        </div>
      </Section>
      <div className="flex justify-end"><Button onClick={save} disabled={busy || (!!check && !check.valid)}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button></div>
    </div>
  );
}
