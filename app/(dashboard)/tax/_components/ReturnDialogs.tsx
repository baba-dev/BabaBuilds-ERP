"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatDay, periodLabel, readError, useMoney, type ObligationView } from "./gst-utils";

const today = () => new Date().toISOString().slice(0, 10);

/** Record a return as filed on the portal. Keyed by return so state resets per open. */
export function FileReturnDialog({ obligation, onClose, onDone }: { obligation: ObligationView | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!obligation} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        {obligation ? <FileForm key={`${obligation.returnType}-${obligation.periodKey}`} obligation={obligation} onClose={onClose} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FileForm({ obligation, onClose, onDone }: { obligation: ObligationView; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("GstHub.file");
  const { locale, m } = useMoney();
  const [filedAt, setFiledAt] = useState(obligation.filing?.filedAt ? String(obligation.filing.filedAt).slice(0, 10) : today());
  const [arn, setArn] = useState(obligation.filing?.arn ?? "");
  const [isNil, setIsNil] = useState(obligation.filing?.isNil ?? obligation.figures?.invoiceCount === 0);
  const [lateFee, setLateFee] = useState(String(obligation.filing?.lateFeePaid || ""));
  const [interest, setInterest] = useState(String(obligation.filing?.interestPaid || ""));
  const [notes, setNotes] = useState(obligation.filing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const late = obligation.daysLate > 0;

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/gst/filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnType: obligation.returnType, periodKey: obligation.periodKey, filedAt, arn: arn.trim() || null, isNil,
          lateFeePaid: Number(lateFee) || 0, interestPaid: Number(interest) || 0, notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, t("failed")));
      toast.success(t("saved", { label: obligation.label }));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title", { label: obligation.label, period: periodLabel(obligation.periodKey, locale) })}</DialogTitle>
        <DialogDescription>{t("description", { due: formatDay(obligation.extendedDueDate ?? obligation.dueDate, locale) })}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        {late ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {t("late", { days: obligation.daysLate, fee: m(obligation.lateFeeEstimate) })}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="filedAt">{t("filedOn")}</Label>
            <Input id="filedAt" type="date" max={today()} value={filedAt} onChange={(e) => setFiledAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="arn">{t("arn")}</Label>
            <Input id="arn" value={arn} maxLength={40} placeholder="AA270426123456X" onChange={(e) => setArn(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">{t("nil")}</p>
            <p className="text-xs text-muted-foreground">{t("nilHint")}</p>
          </div>
          <Switch checked={isNil} onCheckedChange={setIsNil} aria-label={t("nil")} />
        </div>
        {late || Number(lateFee) > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lateFee">{t("lateFee")}</Label>
              <Input id="lateFee" inputMode="decimal" value={lateFee} onChange={(e) => setLateFee(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interest">{t("interest")}</Label>
              <Input id="interest" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0" />
            </div>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="notes">{t("notes")}</Label>
          <Input id="notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>{t("cancel")}</Button>
        <Button onClick={submit} disabled={busy || !filedAt}>
          {busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}
          {obligation.filing?.filedAt ? t("update") : t("submit")}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Record a notified due-date extension, or remove it. */
export function ExtendDialog({ obligation, onClose, onDone }: { obligation: ObligationView | null; onClose: () => void; onDone: () => void }) {
  return (
    <Dialog open={!!obligation} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-sm">
        {obligation ? <ExtendForm key={`${obligation.returnType}-${obligation.periodKey}`} obligation={obligation} onClose={onClose} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ExtendForm({ obligation, onClose, onDone }: { obligation: ObligationView; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("GstHub.extend");
  const { locale } = useMoney();
  const [date, setDate] = useState((obligation.extendedDueDate ?? obligation.dueDate).slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function save(value: string | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/gst/filings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnType: obligation.returnType, periodKey: obligation.periodKey, extendedDueDate: value }) });
      if (!res.ok) throw new Error(await readError(res, t("failed")));
      toast.success(value ? t("saved") : t("removed"));
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title", { label: obligation.label })}</DialogTitle>
        <DialogDescription>{t("description", { due: formatDay(obligation.dueDate, locale) })}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="extDate">{t("newDate")}</Label>
        <Input id="extDate" type="date" min={obligation.dueDate.slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <DialogFooter className="gap-2 sm:gap-2">
        {obligation.extendedDueDate ? <Button variant="ghost" onClick={() => save(null)} disabled={busy}>{t("remove")}</Button> : null}
        <Button onClick={() => save(date)} disabled={busy || !date}>{busy ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden /> : null}{t("save")}</Button>
      </DialogFooter>
    </>
  );
}
