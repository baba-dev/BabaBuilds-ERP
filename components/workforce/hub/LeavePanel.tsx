"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Balance = { id: string; leaveTypeId: string; entitled: number; used: number; pending: number; remaining: number; leaveType: { id: string; name: string; color: string; isPaid: boolean } };
type Req = {
  id: string; days: number; startDate: string; endDate: string; status: string; reason: string | null; rejectionReason?: string | null;
  employee: { id: string; firstName: string; lastName: string };
  leaveType: { name: string; color: string; isPaid: boolean };
};
type Preview = { valid: boolean; error?: string; days?: number; skipped?: number; balance?: { remaining: number; afterRequest: number; isPaid: boolean } };

const TABS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "ALL"] as const;
const TONE: Record<string, string> = { PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300", APPROVED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-300", CANCELLED: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300" };
const today = () => new Date().toISOString().slice(0, 10);

export function LeavePanel() {
  const t = useTranslations("WorkforceHub");
  const locale = useLocale();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("PENDING");
  const [form, setForm] = useState({ leaveTypeId: "", startDate: today(), endDate: today(), halfDay: "NONE", reason: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);

  const loadBalances = useCallback(async () => {
    const res = await fetch("/api/workforce/leave/balances");
    if (!res.ok) return;
    const { balances: b } = (await res.json()) as { balances: Balance[] };
    setBalances(b);
    setForm((f) => (f.leaveTypeId || !b[0] ? f : { ...f, leaveTypeId: b[0].leaveTypeId }));
  }, []);
  const loadRequests = useCallback(async () => {
    const res = await fetch(`/api/workforce/leave/requests${tab === "ALL" ? "" : `?status=${tab}`}`);
    if (!res.ok) return;
    const j = (await res.json()) as { requests: Req[]; canApprove: boolean };
    setRequests(j.requests);
    setCanApprove(j.canApprove);
  }, [tab]);
  useEffect(() => { void loadBalances(); }, [loadBalances]);
  useEffect(() => { void loadRequests(); }, [loadRequests]);

  // live preview, debounced
  useEffect(() => {
    if (!form.leaveTypeId || !form.startDate || !form.endDate) return;
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      const qs = new URLSearchParams({ leaveTypeId: form.leaveTypeId, start: form.startDate, end: form.endDate, halfDay: form.halfDay });
      const res = await fetch(`/api/workforce/leave/preview?${qs}`, { signal: ctl.signal }).catch(() => null);
      if (res) setPreview((await res.json()) as Preview);
    }, 250);
    return () => { clearTimeout(h); ctl.abort(); };
  }, [form.leaveTypeId, form.startDate, form.endDate, form.halfDay]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/workforce/leave/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, reason: form.reason || null }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast.error(j.error ?? t("error")); return; }
      toast.success(t("leave.requested"));
      setForm((f) => ({ ...f, reason: "" }));
      await Promise.all([loadBalances(), loadRequests()]);
    } finally { setBusy(false); }
  }

  async function act(id: string, action: "APPROVE" | "REJECT" | "CANCEL", reason?: string) {
    const res = action === "CANCEL"
      ? await fetch(`/api/workforce/leave/requests/${id}`, { method: "DELETE" })
      : await fetch(`/api/workforce/leave/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, rejectionReason: reason || null }) });
    if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; toast.error(j.error ?? t("error")); return; }
    toast.success(t("leave.done"));
    setRejecting(null);
    await Promise.all([loadBalances(), loadRequests()]);
  }

  const fmt = useMemo(() => (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  const card = "rounded-2xl border border-zinc-200/60 bg-white/60 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-950/40";
  const input = "h-10 w-full rounded-xl border border-zinc-300 bg-transparent px-3 text-sm dark:border-zinc-700";

  return (
    <div className="space-y-6">
      <section className={cn(card, "p-5")} aria-labelledby="wf-bal">
        <h2 id="wf-bal" className="mb-3 text-sm font-black">{t("leave.balances")}</h2>
        {balances.length === 0 ? <p className="text-sm text-zinc-500">{t("leave.noBalances")}</p> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balances.map((b) => (
              <div key={b.id} className="rounded-xl border border-zinc-200/70 p-3 dark:border-zinc-800">
                <p className="text-xs font-semibold text-zinc-500">{b.leaveType.name}</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{t("leave.left", { count: b.remaining })}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-full rounded-full bg-teal-500" style={{ width: `${b.entitled ? Math.min(100, ((b.used + b.pending) / b.entitled) * 100) : 0}%` }} /></div>
                <p className="mt-1.5 text-[11px] text-zinc-500">{t("leave.used", { used: b.used, pending: b.pending })}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <form onSubmit={(e) => void submit(e)} className={cn(card, "space-y-3 p-5")} aria-labelledby="wf-req">
          <h2 id="wf-req" className="text-sm font-black">{t("leave.requestTitle")}</h2>
          <label className="block text-xs font-semibold">{t("leave.type")}
            <select className={cn(input, "mt-1")} value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}>
              {balances.map((b) => <option key={b.leaveTypeId} value={b.leaveTypeId}>{b.leaveType.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold">{t("leave.from")}<input type="date" className={cn(input, "mt-1")} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })} /></label>
            <label className="block text-xs font-semibold">{t("leave.to")}<input type="date" className={cn(input, "mt-1")} min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>
          {form.startDate === form.endDate && (
            <label className="block text-xs font-semibold">{t("leave.half")}
              <select className={cn(input, "mt-1")} value={form.halfDay} onChange={(e) => setForm({ ...form, halfDay: e.target.value })}>
                <option value="NONE">{t("leave.halfNone")}</option><option value="FIRST">{t("leave.halfFirst")}</option><option value="SECOND">{t("leave.halfSecond")}</option>
              </select>
            </label>
          )}
          <label className="block text-xs font-semibold">{t("leave.reason")}<textarea className={cn(input, "mt-1 h-20 py-2")} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          <div aria-live="polite" className="min-h-10 rounded-xl bg-teal-500/5 p-2.5 text-xs">
            {preview?.valid ? (
              <>
                <p className="font-semibold text-teal-700 dark:text-teal-300">{t("leave.days", { count: preview.days ?? 0 })}</p>
                {!!preview.skipped && <p className="text-zinc-500">{t("leave.skipped", { count: preview.skipped })}</p>}
                {preview.balance?.isPaid && <p className={cn("text-zinc-500", preview.balance.afterRequest < 0 && "text-rose-600")}>{t("leave.after", { count: preview.balance.afterRequest })}</p>}
              </>
            ) : preview?.error ? <p className="text-rose-600">{preview.error}</p> : null}
          </div>
          <Button type="submit" disabled={busy || !preview?.valid} className="h-11 w-full">{t("leave.submit")}</Button>
        </form>

        <section className={cn(card, "overflow-hidden")} aria-labelledby="wf-list">
          <header className="flex flex-wrap items-center gap-1 border-b border-zinc-200/60 px-4 py-3 dark:border-zinc-800/60">
            <h2 id="wf-list" className="me-3 text-sm font-black">{t("leave.requests")}</h2>
            {TABS.map((s) => <button key={s} onClick={() => setTab(s)} aria-pressed={tab === s} className={cn("rounded-full px-3 py-1 text-xs font-semibold", tab === s ? "bg-teal-600 text-white" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800")}>{t(s === "ALL" ? "leave.tab.all" : `leave.tab.${s}`)}</button>)}
          </header>
          {requests.length === 0 ? <p className="p-6 text-sm text-zinc-500">{t("leave.empty")}</p> : (
            <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {requests.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold">{r.employee.firstName} {r.employee.lastName}</span>
                    <span className="text-xs text-zinc-500">{r.leaveType.name} · {fmt(r.startDate)}{r.startDate !== r.endDate ? ` – ${fmt(r.endDate)}` : ""} · {t("leave.dayCount", { count: r.days })}</span>
                    <span className={cn("ms-auto rounded-full px-2 py-0.5 text-[11px] font-bold", TONE[r.status])}>{t(`leave.tab.${r.status}`)}</span>
                  </div>
                  {r.reason && <p className="text-xs text-zinc-500">{r.reason}</p>}
                  {r.rejectionReason && <p className="text-xs text-rose-600">{r.rejectionReason}</p>}
                  {rejecting?.id === r.id ? (
                    <div className="flex gap-2">
                      <input className={cn(input, "h-9")} placeholder={t("leave.rejectReason")} value={rejecting.reason} onChange={(e) => setRejecting({ id: r.id, reason: e.target.value })} />
                      <Button size="sm" variant="destructive" onClick={() => void act(r.id, "REJECT", rejecting.reason)}>{t("leave.reject")}</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {canApprove && r.status === "PENDING" && (<>
                        <Button size="sm" onClick={() => void act(r.id, "APPROVE")}><Check className="me-1 h-3.5 w-3.5" />{t("leave.approve")}</Button>
                        <Button size="sm" variant="outline" onClick={() => setRejecting({ id: r.id, reason: "" })}><X className="me-1 h-3.5 w-3.5" />{t("leave.reject")}</Button>
                      </>)}
                      {(r.status === "PENDING" || r.status === "APPROVED") && <Button size="sm" variant="ghost" onClick={() => void act(r.id, "CANCEL")}>{t("leave.cancel")}</Button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
