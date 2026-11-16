"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ACCESS_LABEL, Chip, ErrorNote, adminRequest, dateTime, day, relative, useAdminJson } from "./admin-kit";

type Detail = {
  id: string; name: string; createdAt: string; isDemo: boolean; country: string; currency: string; setupComplete: boolean;
  plan: { status: string; tier: string; interval: string | null; endsAt: string | null; provider: string | null; cancelAtPeriodEnd: boolean; access: string };
  usage: { invoices: number; clients: number; expenses: number; modules: string[] };
  members: Array<{ userId: string; email: string | null; name: string | null; role: string; active: boolean; joinedAt: string; lastActiveAt: string | null }>;
  recentActivity: Array<{ id: string; action: string; status: string; actor: string | null; at: string }>;
};

const ACTIONS = [
  { key: "SET_PLAN", label: "Set a paid plan", needs: ["plan", "interval", "days"] },
  { key: "EXTEND", label: "Extend the current plan", needs: ["days"] },
  { key: "GRANT_TRIAL", label: "Grant a trial", needs: ["days"] },
  { key: "SET_FREE", label: "Move to Free", needs: [] },
  { key: "SUSPEND", label: "Suspend", needs: [] },
  { key: "REACTIVATE", label: "Reactivate", needs: [] },
] as const;

/** What a workspace is, who is in it, and the plan actions. Every change needs a reason and is written to the activity log. */
export function AccountDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, error, reload } = useAdminJson<Detail>(id ? `/api/admin/accounts/${id}` : null);
  const [action, setAction] = useState<(typeof ACTIONS)[number]["key"]>("SET_PLAN");
  const [plan, setPlan] = useState<"PRO" | "TEAM">("PRO");
  const [interval, setInterval] = useState("MONTHLY");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const def = ACTIONS.find((a) => a.key === action)!;
  const needs = def.needs as readonly string[];
  const daysNum = days.trim() ? Number(days) : undefined;
  const reasonOk = reason.trim().length >= 5;
  const daysOk = !needs.includes("days") || action === "SET_PLAN" ? true : !!daysNum && Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 730;
  const canSubmit = !!data && reasonOk && daysOk;
  const summary = (() => {
    if (action === "SET_PLAN") return `Set ${plan} (${interval.toLowerCase().replace("team_", "")}) for ${daysNum ?? (interval.includes("YEARLY") ? 365 : interval === "QUARTERLY" ? 90 : 30)} days`;
    if (action === "EXTEND") return `Extend by ${daysNum ?? "?"} days`;
    if (action === "GRANT_TRIAL") return `Grant a ${daysNum ?? "?"}-day trial`;
    return def.label;
  })();

  async function submit() {
    if (!data) return;
    setBusy(true);
    const res = await adminRequest<{ summary: string }>(`/api/admin/accounts/${data.id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "SET_PLAN" ? { plan, interval } : {}), ...(daysNum ? { days: daysNum } : {}), reason: reason.trim() }) });
    setBusy(false); setConfirm(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(res.data.summary);
    setReason(""); setDays("");
    reload(); onChanged();
  }

  const acc = data ? (ACCESS_LABEL[data.plan.access] ?? ACCESS_LABEL.FREE) : null;
  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{data?.name ?? "Workspace"}</SheetTitle>
          <SheetDescription className="font-mono text-xs">{id}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          {error ? <ErrorNote message={error} onRetry={reload} /> : null}
          {!data && !error ? <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div> : null}
          {data && acc ? (
            <>
              <section aria-label="Plan" className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Chip tone={acc.tone}>{acc.label}</Chip>{data.isDemo ? <Chip>demo</Chip> : null}</div><p className="text-xs text-muted-foreground">stored status: {data.plan.status}</p></div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Tier</dt><dd>{data.plan.tier}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Ends</dt><dd>{data.plan.endsAt ? `${day(data.plan.endsAt)} (${relative(data.plan.endsAt)})` : "no end date"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Billing provider</dt><dd>{data.plan.provider ?? "none"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Cancels at period end</dt><dd>{data.plan.cancelAtPeriodEnd ? "yes" : "no"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Country · currency</dt><dd>{data.country} · {data.currency}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Created</dt><dd>{day(data.createdAt)}</dd></div>
                </dl>
                {data.plan.access === "EXPIRED_PAID" ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">Stored as {data.plan.status} but the end date has passed (or is missing), so this workspace has no paid access.</p> : null}
              </section>

              <section aria-label="Change the plan" className="space-y-3 rounded-xl border border-border/70 p-4">
                <h3 className="text-sm font-semibold">Change the plan</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium sm:col-span-2">Action
                    <select value={action} onChange={(e) => setAction(e.target.value as typeof action)} className="h-9 w-full rounded-md border border-border/70 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
                  </label>
                  {needs.includes("plan") ? (
                    <>
                      <label className="space-y-1 text-xs font-medium">Plan<select value={plan} onChange={(e) => { const p = e.target.value as "PRO" | "TEAM"; setPlan(p); setInterval(p === "TEAM" ? "TEAM_MONTHLY" : "MONTHLY"); }} className="h-9 w-full rounded-md border border-border/70 bg-background px-2 text-sm"><option value="PRO">Pro</option><option value="TEAM">Team</option></select></label>
                      <label className="space-y-1 text-xs font-medium">Billing length<select value={interval} onChange={(e) => setInterval(e.target.value)} className="h-9 w-full rounded-md border border-border/70 bg-background px-2 text-sm">{(plan === "TEAM" ? [["TEAM_MONTHLY", "Monthly (30 days)"], ["TEAM_YEARLY", "Yearly (365 days)"]] : [["MONTHLY", "Monthly (30 days)"], ["QUARTERLY", "Quarterly (90 days)"], ["YEARLY", "Yearly (365 days)"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                    </>
                  ) : null}
                  {needs.includes("days") ? <label className="space-y-1 text-xs font-medium">{action === "SET_PLAN" ? "Override days (optional)" : "Days"}<Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder={action === "SET_PLAN" ? "from billing length" : "e.g. 14"} className="h-9" /></label> : null}
                  <label className="space-y-1 text-xs font-medium sm:col-span-2">Reason (kept in the activity log)<Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Bank transfer received, invoice 1234" /></label>
                </div>
                <Button type="button" disabled={!canSubmit || busy} onClick={() => setConfirm(true)}>{busy ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : null}Review change</Button>
              </section>

              <section aria-label="Usage"><h3 className="text-sm font-semibold">Usage</h3>
                <p className="mt-1 text-sm text-muted-foreground">{data.usage.invoices} invoices · {data.usage.clients} clients · {data.usage.expenses} expenses</p>
                <p className="mt-1 text-xs text-muted-foreground">Modules on: {data.usage.modules.length ? data.usage.modules.join(", ") : "none"}</p>
              </section>

              <section aria-label="Members"><h3 className="text-sm font-semibold">Members ({data.members.length})</h3>
                <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/70">
                  {data.members.map((m) => <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate">{m.email ?? m.name ?? m.userId}</p><p className="text-xs text-muted-foreground">last active {relative(m.lastActiveAt)}</p></div><span className="flex items-center gap-1.5"><Chip>{m.role}</Chip>{m.active ? null : <Chip tone="amber">inactive</Chip>}</span></li>)}
                </ul>
              </section>

              <section aria-label="Recent activity"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Recent activity</h3><Link href={`/admin/logs?workspaceId=${data.id}`} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">View activity</Link></div>
                {data.recentActivity.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nothing recorded yet.</p> : <ul className="mt-2 space-y-1.5 text-xs">{data.recentActivity.map((r) => <li key={r.id} className="flex justify-between gap-3"><span className="min-w-0 truncate font-mono">{r.action}</span><span className="shrink-0 text-muted-foreground" title={dateTime(r.at)}>{relative(r.at)}</span></li>)}</ul>}
              </section>
            </>
          ) : null}
        </div>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Confirm: {summary}</AlertDialogTitle><AlertDialogDescription>This changes {data?.name}. The reason and the before and after are recorded in the activity log.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void submit(); }}>{busy ? "Applying…" : "Apply"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
