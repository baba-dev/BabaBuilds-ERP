"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "./shared";

export type RefundTarget = { id: string; number: string; total: number; method: string | null };

/** Takes back a whole sale: refund, credit note and stock back on the shelf. */
export function RefundDialog({ target, money, onClose, onDone }: { target: RefundTarget | null; money: (n: number) => string; onClose: () => void; onDone: () => void }) {
  return target ? <Body key={target.id} target={target} money={money} onClose={onClose} onDone={onDone} /> : null;
}

function Body({ target, money, onClose, onDone }: { target: RefundTarget; money: (n: number) => string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("PosRegister");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ creditNoteNumber: string }>(`/api/pos/sales/${target.id}/void`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      toast.success(t("refund.done", { number: target.number, note: r.creditNoteNumber }));
      onDone(); onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("refund.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("refund.title", { number: target.number })}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("refund.intro")}</p>
        <div className="rounded-xl bg-muted/60 p-4 text-center"><p className="text-xs text-muted-foreground">{t("refund.amount")}</p><p className="text-3xl font-semibold tabular-nums">{money(target.total)}</p>{target.method ? <p className="text-xs text-muted-foreground">{t("refund.giveBack", { method: t(`method.${target.method}`) })}</p> : null}</div>
        <div><Label htmlFor="rf-reason">{t("refund.reason")}</Label><Input id="rf-reason" value={reason} maxLength={200} autoFocus onChange={(e) => setReason(e.target.value)} placeholder={t("refund.reasonHint")} /></div>
        {err ? <p role="alert" className="text-sm text-rose-600">{err}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button><Button variant="destructive" disabled={reason.trim().length < 3 || busy} onClick={() => void confirm()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("refund.confirm")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
