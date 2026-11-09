"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Cpu, Database, Download, HardDrive, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, Chip, ErrorNote, adminRequest, bytes, dateTime, relative, useAdminJson } from "./admin-kit";

type Backup = { filename: string; size: number; createdAt: string };
type Diag = { databaseLatency?: string; memory?: { percent: number; used: string; total: string }; cpu?: { cores: number; model: string; loadAverage: string }; uptime?: string; status?: string };

type Risk = "low" | "medium" | "high";
const TASKS: Array<{ action: string; title: string; body: string; risk: Risk }> = [
  { action: "CLEAR_CACHE", title: "Clear the output cache", body: "Removes Next.js build cache files. Pages rebuild on the next visit.", risk: "low" },
  { action: "CLEAR_LOGS", title: "Truncate server log files", body: "Empties the .log files in the app folder. The activity log in the database is not touched.", risk: "low" },
  { action: "PRUNE_FILES", title: "Delete orphaned uploads", body: "Scans storage and removes files that no record points to. Cannot be undone, so take a backup first.", risk: "medium" },
  { action: "STAMP_PAID_INVOICES", title: "Re-stamp paid invoices", body: "Regenerates PDFs for paid invoices that lack the PAID stamp.", risk: "medium" },
  { action: "REGENERATE_INVOICES", title: "Regenerate every invoice PDF", body: "Rebuilds all invoice PDFs. Slow on a large platform.", risk: "high" },
  { action: "PURGE_DEMO", title: "Delete demo accounts", body: "Deletes every demo user and their data. Real customers are not touched.", risk: "high" },
  { action: "REBOOT", title: "Restart the application", body: "Stops the process; your process manager must start it again. Everyone is signed out of in-flight requests.", risk: "high" },
];
const RISK_TONE = { low: "green", medium: "amber", high: "red" } as const;

export function OperationsClient() {
  const backups = useAdminJson<Backup[]>("/api/admin/backups");
  const diag = useAdminJson<Diag>("/api/admin/diagnostics");
  const [creating, setCreating] = useState(false);
  const [task, setTask] = useState<(typeof TASKS)[number] | null>(null);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const [del, setDel] = useState<string | null>(null);

  async function createBackup() {
    setCreating(true);
    const r = await adminRequest<{ filename: string; uploads: boolean }>("/api/admin/backups", { method: "POST" });
    setCreating(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.data.uploads ? "Backup created (database and uploaded files)" : "Backup created (database only, there were no uploads)");
    backups.reload();
  }

  async function run() {
    if (!task) return;
    setRunning(true);
    const r = await adminRequest<{ message?: string }>("/api/admin/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: task.action }) });
    setRunning(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(r.data.message ?? "Done");
    setTask(null); setTyped("");
  }

  async function remove(name: string) {
    const r = await adminRequest(`/api/admin/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
    setDel(null);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Backup deleted");
    backups.reload();
  }

  const d = diag.data;
  return (
    <div className="space-y-5">
      <Card title="Server" right={d?.status ? <Chip tone={d.status === "Healthy" ? "green" : "amber"}>{d.status}</Chip> : null}>
        {diag.error && !d ? <ErrorNote message={diag.error} onRetry={diag.reload} /> : !d ? <Skeleton className="h-16 rounded-xl" /> : (
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><HardDrive className="size-3" aria-hidden />Memory</dt><dd className="font-semibold">{d.memory?.percent}% <span className="text-xs font-normal text-muted-foreground">{d.memory?.used} of {d.memory?.total}</span></dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Cpu className="size-3" aria-hidden />CPU load</dt><dd className="font-semibold">{d.cpu?.loadAverage} <span className="text-xs font-normal text-muted-foreground">{d.cpu?.cores} cores</span></dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-muted-foreground"><Database className="size-3" aria-hidden />Database</dt><dd className="font-semibold">{d.databaseLatency}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Server uptime</dt><dd className="font-semibold">{d.uptime}</dd></div>
          </dl>
        )}
      </Card>

      <Card title="Backups" hint="A consistent database snapshot plus uploaded files. The newest 5 are kept." right={<Button size="sm" onClick={() => void createBackup()} disabled={creating}>{creating ? <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden /> : <Plus className="me-1.5 size-4" aria-hidden />}Create backup</Button>}>
        {backups.error && !backups.data ? <ErrorNote message={backups.error} onRetry={backups.reload} /> : !backups.data ? <Skeleton className="h-20 rounded-xl" /> : backups.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups yet. Create one before any maintenance below.</p>
        ) : (
          <ul className="-my-1 divide-y divide-border/60">
            {backups.data.map((b) => (
              <li key={b.filename} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="truncate font-mono text-xs">{b.filename}</p><p className="text-xs text-muted-foreground">{relative(b.createdAt)} · {dateTime(b.createdAt)} · {bytes(b.size)}</p></div>
                <div className="flex items-center gap-2">
                  <a href={`/api/admin/backups/${encodeURIComponent(b.filename)}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-3 text-xs font-medium hover:bg-muted"><Download className="size-3.5" aria-hidden />Download</a>
                  <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDel(b.filename)} aria-label={`Delete ${b.filename}`}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Maintenance" hint="Each action asks you to type its name first. Take a backup before anything marked medium or high.">
        <ul className="-my-1 divide-y divide-border/60">
          {TASKS.map((t) => (
            <li key={t.action} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-sm font-medium">{t.title}<Chip tone={RISK_TONE[t.risk]}>{t.risk} risk</Chip></p><p className="mt-0.5 text-xs text-muted-foreground">{t.body}</p></div>
              <Button size="sm" variant="outline" onClick={() => { setTask(t); setTyped(""); }}>Run…</Button>
            </li>
          ))}
        </ul>
      </Card>

      <AlertDialog open={!!task} onOpenChange={(o) => { if (!o && !running) { setTask(null); setTyped(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{task?.title}</AlertDialogTitle><AlertDialogDescription>{task?.body}</AlertDialogDescription></AlertDialogHeader>
          <label className="block space-y-1.5 text-sm">Type <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{task?.action}</code> to confirm
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} onKeyDown={(e) => { if (e.key === "Enter" && typed === task?.action) void run(); }} />
          </label>
          <AlertDialogFooter><AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel><Button onClick={() => void run()} disabled={typed !== task?.action || running} variant={task?.risk === "high" ? "destructive" : "default"}>{running ? "Running…" : "Run now"}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!del} onOpenChange={(o) => { if (!o) setDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this backup?</AlertDialogTitle><AlertDialogDescription className="font-mono text-xs">{del}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><Button variant="destructive" onClick={() => { if (del) void remove(del); }}>Delete</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
