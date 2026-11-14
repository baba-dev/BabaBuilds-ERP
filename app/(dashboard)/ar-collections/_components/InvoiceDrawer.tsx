"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, shortDay, type Row, type TimelineItem, type Tone } from "./shared";

/** Everything you can do about one invoice, and what has already been done. */
export function InvoiceDrawer({ row, locale, money, canEdit, canSend, onClose, onChanged }: { row: Row | null; locale: string; money: (n: number) => string; canEdit: boolean; canSend: boolean; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("Collections");
  const [tl, setTl] = useState<{ id: string; items: TimelineItem[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone | "auto">("auto");
  const [promise, setPromise] = useState({ date: "", note: "" });
  const [dispute, setDispute] = useState("");
  const [note, setNote] = useState("");
  const [snoozeDays, setSnoozeDays] = useState("7");
  const id = row?.id;

  const loadTimeline = useCallback(() => {
    if (!id) return;
    api<TimelineItem[]>(`/api/ar-collections/invoices/${id}`).then((items) => setTl({ id, items })).catch(() => setTl({ id, items: [] }));
  }, [id]);
  useEffect(() => { loadTimeline(); }, [loadTimeline]);
  const timeline = tl && tl.id === id ? tl.items : null;

  const run = async (key: string, body: Record<string, unknown>, ok?: string) => {
    if (!id) return;
    setBusy(key);
    try {
      await api(`/api/ar-collections/invoices/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(ok ?? t("saved"));
      loadTimeline(); onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveFailed"));
    } finally { setBusy(null); }
  };

  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {row ? (
          <>
            <SheetHeader>
              <SheetTitle>{row.invoiceNumber} · {row.clientName}</SheetTitle>
              <SheetDescription>{t("drawerSummary", { amount: money(row.outstanding), due: shortDay(row.dueDate, locale), days: row.daysOverdue })}{row.dueIsDerived ? ` · ${t("dueDerived")}` : ""}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-8">
              {row.disputeReason ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{t("disputedBecause", { reason: row.disputeReason })}</p> : null}
              {canEdit ? (
                <>
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">{t("sendReminder")}</h3>
                    <div className="flex gap-2">
                      <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}><SelectTrigger className="w-44" aria-label={t("tone")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">{t("toneAuto")}</SelectItem>{(["friendly", "firm", "final"] as const).map((x) => <SelectItem key={x} value={x}>{t(`tone_${x}`)}</SelectItem>)}</SelectContent></Select>
                      <Button disabled={!canSend || busy === "remind"} onClick={() => void run("remind", { action: "remind", ...(tone === "auto" ? {} : { tone }) }, t("reminderSent"))}>{busy === "remind" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("sendNow")}</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{row.lastReminderSentAt ? t("lastReminder", { date: shortDay(row.lastReminderSentAt, locale), count: row.reminders }) : t("noReminderYet")}</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">{t("logPromise")}</h3>
                    <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                      <Input type="date" value={promise.date} onChange={(e) => setPromise({ ...promise, date: e.target.value })} aria-label={t("promiseDate")} />
                      <Input value={promise.note} onChange={(e) => setPromise({ ...promise, note: e.target.value })} placeholder={t("notePlaceholder")} aria-label={t("note")} />
                      <Button variant="outline" disabled={!promise.date || busy === "promise"} onClick={() => void run("promise", { action: "promise", date: promise.date, note: promise.note })}>{t("save")}</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("promiseHint")}</p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">{row.followUpStatus === "DISPUTED" ? t("disputeOpen") : t("markDisputed")}</h3>
                    {row.followUpStatus === "DISPUTED" ? (
                      <Button variant="outline" disabled={busy === "resolve"} onClick={() => void run("resolve", { action: "resolve_dispute" })}>{t("resolveDispute")}</Button>
                    ) : (
                      <div className="flex gap-2"><Input value={dispute} onChange={(e) => setDispute(e.target.value)} placeholder={t("disputeReason")} aria-label={t("disputeReason")} /><Button variant="outline" disabled={dispute.trim().length < 3 || busy === "dispute"} onClick={() => void run("dispute", { action: "dispute", reason: dispute }).then(() => setDispute(""))}>{t("save")}</Button></div>
                    )}
                  </section>

                  <section className="flex flex-wrap items-end gap-2">
                    <div><Label className="text-xs" htmlFor="snz">{t("snoozeDays")}</Label><Input id="snz" type="number" min="1" max="90" value={snoozeDays} onChange={(e) => setSnoozeDays(e.target.value)} className="w-24" /></div>
                    <Button variant="outline" disabled={busy === "snooze"} onClick={() => void run("snooze", { action: "snooze", days: Number(snoozeDays) })}>{t("snooze")}</Button>
                    <Button variant="outline" disabled={busy === "escalate" || row.followUpStatus === "ESCALATED"} onClick={() => void run("escalate", { action: "escalate" })}>{t("escalate")}</Button>
                    <Button variant="ghost" disabled={busy === "status"} onClick={() => void run("status", { action: "status", followUpStatus: "UNTOUCHED" })}>{t("clearStatus")}</Button>
                  </section>
                </>
              ) : null}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{t("timeline")}</h3>
                {canEdit ? <div className="flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("addNote")} aria-label={t("addNote")} maxLength={500} /><Button variant="outline" disabled={!note.trim() || busy === "note"} onClick={() => void run("note", { action: "note", note }).then(() => setNote(""))}>{t("add")}</Button></div> : null}
                {timeline == null ? <p className="text-sm text-muted-foreground">…</p> : timeline.length === 0 ? <p className="text-sm text-muted-foreground">{t("noHistory")}</p> : (
                  <ol className="space-y-2 border-l pl-4">
                    {timeline.map((e) => <li key={e.id} className="text-sm"><p>{e.message ?? e.type}</p><p className="text-xs text-muted-foreground">{shortDay(e.at, locale)} · {e.type.replace(/_/g, " ").toLowerCase()}</p></li>)}
                  </ol>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
