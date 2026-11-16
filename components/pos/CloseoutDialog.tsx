"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cashVariance } from "@/lib/pos/closeout";
import { cn } from "@/lib/utils";
import { api, type Shift } from "./shared";

/** Count the cash in the till against what the day's sales say it should hold. */
export function CloseoutDialog({ open, shift, money, onClose, onDone }: { open: boolean; shift: Shift | null; money: (n: number) => string; onClose: () => void; onDone: () => void }) {
  return open && shift ? <Body shift={shift} money={money} onClose={onClose} onDone={onDone} /> : null;
}

function Body({ shift, money, onClose, onDone }: { shift: Shift; money: (n: number) => string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("PosRegister");
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const has = counted !== "" && Number.isFinite(Number(counted));
  const variance = has ? cashVariance(shift.expectedCash, Number(counted)) : null;
  const needsNote = variance !== null && variance !== 0;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/api/pos/closeout", { method: "POST", body: JSON.stringify({ countedCash: Number(counted), ...(notes.trim() ? { notes: notes.trim() } : {}) }) });
      toast.success(t("closeout.saved"));
      onDone(); onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("closeout.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>{t("closeout.title")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("closeout.intro", { count: shift.salesCount })}</p>
        <dl className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-sm">
          {shift.byMethod.map((m) => <div key={m.method} className="flex justify-between"><dt className="text-muted-foreground">{t(`method.${m.method}`)} · {m.count}</dt><dd className="tabular-nums">{money(m.amount)}</dd></div>)}
          <div className="flex justify-between border-t pt-1.5 font-medium"><dt>{t("closeout.expected")}</dt><dd className="tabular-nums">{money(shift.expectedCash)}</dd></div>
        </dl>
        <div><Label htmlFor="co-count">{t("closeout.counted")}</Label><Input id="co-count" inputMode="decimal" className="h-12 text-lg" autoFocus value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} /></div>
        {variance !== null ? <p className={cn("text-sm font-medium", variance === 0 ? "text-emerald-600" : "text-amber-600")}>{variance === 0 ? t("closeout.balanced") : variance < 0 ? t("closeout.short", { amount: money(-variance) }) : t("closeout.over", { amount: money(variance) })}</p> : null}
        {needsNote ? <div><Label htmlFor="co-note">{t("closeout.note")}</Label><Input id="co-note" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder={t("closeout.noteHint")} /></div> : null}
        {err ? <p role="alert" className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button><Button disabled={!has || busy || (needsNote && !notes.trim())} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("closeout.confirm")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
