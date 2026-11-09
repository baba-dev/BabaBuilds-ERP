"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, Search, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Chip, ErrorNote, adminRequest, dateTime, relative, useAdminJson } from "./admin-kit";

type Log = { id: string; workspaceId: string | null; actorEmail: string | null; action: string; entityType: string | null; entityId: string | null; status: string; metadata: unknown; ipAddress: string | null; correlationId: string | null; createdAt: string; workspace?: { name: string } | null };
type Resp = { logs: Log[]; total: number; page: number; pages: number; integrity?: { valid: boolean; checked: number; violations: unknown[] } };

const STATUSES = ["ALL", "SUCCESS", "FAILURE", "WARNING", "INFO"];
const tone = (s: string) => (s === "SUCCESS" ? "green" : s === "FAILURE" ? "red" : s === "WARNING" ? "amber" : "grey") as "green" | "red" | "amber" | "grey";

export function LogsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const type = params.get("type") === "tax_audit" ? "tax_audit" : "activity";
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "ALL";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const workspaceId = params.get("workspaceId") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const [text, setText] = useState(q);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [prune, setPrune] = useState(false);
  const [days, setDays] = useState("90");
  const [pruning, setPruning] = useState(false);

  const set = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);
  useEffect(() => { const h = setTimeout(() => { if (text !== q) set({ q: text || null, page: null }); }, 300); return () => clearTimeout(h); }, [text, q, set]);

  const qs = new URLSearchParams({ type, page: String(page), ...(q ? { search: q } : {}), ...(status !== "ALL" ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(workspaceId ? { workspaceId } : {}) });
  const { data, error, loading, reload } = useAdminJson<Resp>(`/api/admin/logs?${qs.toString()}`);

  async function runPrune() {
    setPruning(true);
    const r = await adminRequest<{ purged: number }>(`/api/admin/logs?olderThanDays=${Number(days)}`, { method: "DELETE" });
    setPruning(false); setPrune(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Removed ${r.data.purged} entries older than ${days} days`);
    reload();
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Log type" className="inline-flex rounded-xl border border-border/70 p-1">
        {([["activity", "Platform activity"], ["tax_audit", "Tax audit chain"]] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={type === k} onClick={() => set({ type: k === "activity" ? null : k, page: null, status: null })} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", type === k ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "text-muted-foreground")}>{l}</button>)}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search action, actor, entity or IP" aria-label="Search the log" className="h-9 ps-9" /></div>
        {type === "activity" ? (
          <>
            <label className="space-y-1 text-xs text-muted-foreground">Status<select value={status} onChange={(e) => set({ status: e.target.value === "ALL" ? null : e.target.value, page: null })} className="block h-9 rounded-md border border-border/70 bg-background px-2 text-sm text-foreground">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="space-y-1 text-xs text-muted-foreground">From<input type="date" value={from} onChange={(e) => set({ from: e.target.value || null, page: null })} className="block h-9 rounded-md border border-border/70 bg-background px-2 text-sm text-foreground" /></label>
            <label className="space-y-1 text-xs text-muted-foreground">To<input type="date" value={to} onChange={(e) => set({ to: e.target.value || null, page: null })} className="block h-9 rounded-md border border-border/70 bg-background px-2 text-sm text-foreground" /></label>
          </>
        ) : null}
        {workspaceId ? <button type="button" onClick={() => set({ workspaceId: null, page: null })} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-indigo-300 bg-indigo-50 px-3 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">Workspace {workspaceId.slice(0, 8)}… ✕</button> : null}
        {type === "activity" ? <Button variant="outline" size="sm" className="ms-auto" onClick={() => setPrune(true)}>Prune old entries…</Button> : null}
      </div>

      {data?.integrity ? (
        <p className={cn("flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm", data.integrity.valid ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200")}>
          {data.integrity.valid ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}{data.integrity.valid ? `Chain intact. ${data.integrity.checked} entries verified. This log cannot be deleted.` : `${data.integrity.violations.length} entries failed verification.`}
        </p>
      ) : null}

      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!data && !error ? <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div> : null}
      {data ? (
        <div className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-opacity", loading && "opacity-60")}>
          {data.logs.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">No entries match.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-border/60 bg-muted/40 text-xs text-muted-foreground"><tr><th scope="col" className="w-8 px-2" /><th scope="col" className="px-3 py-2.5 text-start font-medium">When</th><th scope="col" className="px-3 py-2.5 text-start font-medium">Action</th><th scope="col" className="px-3 py-2.5 text-start font-medium">Actor</th><th scope="col" className="px-3 py-2.5 text-start font-medium">Workspace</th><th scope="col" className="px-3 py-2.5 text-start font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-border/60">
                  {data.logs.map((l) => (
                    <Fragment key={l.id}>
                      <tr className="hover:bg-muted/40">
                        <td className="px-2"><button type="button" aria-expanded={openRow === l.id} aria-label="Show details" onClick={() => setOpenRow(openRow === l.id ? null : l.id)} className="rounded p-1 hover:bg-muted"><ChevronDown className={cn("size-4 transition-transform", openRow === l.id && "rotate-180")} aria-hidden /></button></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs" title={dateTime(l.createdAt)}>{relative(l.createdAt)}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{l.action}</td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-xs">{l.actorEmail ?? "system"}</td>
                        <td className="max-w-[160px] truncate px-3 py-2.5 text-xs text-muted-foreground">{l.workspace?.name ?? (l.workspaceId ? l.workspaceId.slice(0, 8) : "–")}</td>
                        <td className="px-3 py-2.5">{l.status ? <Chip tone={tone(l.status)}>{l.status.toLowerCase()}</Chip> : null}</td>
                      </tr>
                      {openRow === l.id ? <tr><td /><td colSpan={5} className="px-3 pb-3"><pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">{JSON.stringify({ entity: l.entityType ? `${l.entityType}:${l.entityId ?? ""}` : undefined, ip: l.ipAddress, correlationId: l.correlationId, metadata: l.metadata }, null, 2)}</pre></td></tr> : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{data.total} entr{data.total === 1 ? "y" : "ies"}</span>
            <div className="flex items-center gap-1"><button type="button" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page" className="rounded p-1 hover:bg-muted disabled:opacity-40"><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></button><span className="tabular-nums">Page {data.page} of {Math.max(1, data.pages)}</span><button type="button" disabled={page >= data.pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page" className="rounded p-1 hover:bg-muted disabled:opacity-40"><ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></button></div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={prune} onOpenChange={(o) => { if (!pruning) setPrune(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Prune old activity entries</AlertDialogTitle><AlertDialogDescription>Removes platform activity entries older than the period you choose. Recent entries and the tax audit chain are never touched. This cannot be undone, and the pruning itself is recorded.</AlertDialogDescription></AlertDialogHeader>
          <label className="block space-y-1.5 text-sm">Remove entries older than<select value={days} onChange={(e) => setDays(e.target.value)} className="block h-9 w-full rounded-md border border-border/70 bg-background px-2 text-sm">{[["30", "30 days"], ["90", "90 days"], ["180", "180 days"], ["365", "1 year"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <AlertDialogFooter><AlertDialogCancel disabled={pruning}>Cancel</AlertDialogCancel><Button variant="destructive" onClick={() => void runPrune()} disabled={pruning}>{pruning ? "Removing…" : "Remove entries"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
