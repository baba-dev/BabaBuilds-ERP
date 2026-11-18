"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

type Delivery = {
  id: string; workspaceId: string; eventKind: string; channel: string;
  status: string; attempts: number; lastErrorCode: string | null;
  createdAt: string; acceptedAt: string | null;
  externalAttemptedAt: string | null; leaseExpiresAt: string | null;
};
type Overview = {
  items: Delivery[];
  summary: Array<{ channel: string; status: string; count: number }>;
};
type RecoveryAction = "retry-pre-send" | "confirm-accepted" | "suppress";

const styles: Record<string, string> = {
  PROVIDER_ACCEPTED: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300",
  UNCERTAIN: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300",
  CLAIMED: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300",
  FAILED: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300",
};

export default function DeliveryRecoveryPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [action, setAction] = useState<RecoveryAction>("retry-pre-send");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set("status", status);
      if (channel) q.set("channel", channel);
      const response = await fetch("/api/admin/jobs/deliveries?" + q, {
        signal, credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw new Error("Status fetch failed (" + response.status + ")");
      const data = await response.json() as Overview;
      setOverview(data);
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load deliveries");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [status, channel]);

  useEffect(() => {
    const ac = new AbortController();
    void refresh(ac.signal);
    return () => ac.abort();
  }, [refresh]);

  const expectedConfirmation = selected
    ? "CONFIRM_" + action.toUpperCase().replace(/-/g, "_") + "_" + selected.id : "";
  const resetSelection = () => {
    setSelected(null); setReason(""); setEvidence(""); setConfirmation("");
  };
  const submit = async () => {
    if (!selected || confirmation !== expectedConfirmation || reason.length < 16) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/jobs/deliveries/" + encodeURIComponent(selected.id), {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, providerEvidence: evidence, confirmation }),
      });
      const result = await response.json() as { code?: string; error?: string };
      if (!response.ok) throw new Error(result.code || result.error || "Recovery action rejected");
      resetSelection();
      setError("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Recovery action failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-5" aria-label="Delivery recovery">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-indigo-500" aria-hidden/>Provider-aware delivery ledger</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Authoritative PostgreSQL status for email, push and scheduled reports. No recipient
              addresses, provider credentials, report contents or subscription endpoints are displayed.
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <RefreshCw className="size-4" aria-hidden/>Refresh
          </button>
        </div>
        {overview?.summary.length ? (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {overview.summary.map((item) => (
              <div key={item.channel + item.status} className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">{item.channel} · {item.status}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{item.count.toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <h2 className="me-auto text-base font-semibold">Delivery records</h2>
          <label className="text-xs text-muted-foreground">State
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="ms-2 rounded-lg border bg-background px-2 py-1.5 text-sm">
              {["", "PENDING", "CLAIMED", "PROVIDER_ACCEPTED", "UNCERTAIN", "FAILED", "SUPPRESSED"].map((s) => (
                <option key={s} value={s}>{s || "All states"}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Channel
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="ms-2 rounded-lg border bg-background px-2 py-1.5 text-sm">
              {["", "EMAIL", "PUSH", "REPORT_EMAIL"].map((s) => (
                <option key={s} value={s}>{s || "All channels"}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>{["Channel", "State", "Workspace", "Attempts", "Updated", "Action"].map((v) => <th scope="col" className="px-4 py-3" key={v}>{v}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {overview?.items.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3"><span className="font-medium">{entry.channel}</span><p className="max-w-[12rem] truncate text-xs text-muted-foreground" title={entry.eventKind}>{entry.eventKind}</p></td>
                  <td className="px-4 py-3"><span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset " + (styles[entry.status] || "bg-muted text-foreground ring-border")}>{entry.status}</span><p className="mt-1 text-xs text-muted-foreground">{entry.lastErrorCode || ""}</p></td>
                  <td className="max-w-[13rem] truncate px-4 py-3 font-mono text-xs" title={entry.workspaceId}>{entry.workspaceId}</td>
                  <td className="px-4 py-3 tabular-nums">{entry.attempts}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><button type="button" className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted" onClick={() => {
                    setSelected(entry); setAction("retry-pre-send"); setConfirmation(""); setReason(""); setEvidence("");
                  }}>Review</button></td>
                </tr>
              ))}
              {!loading && !overview?.items.length ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No delivery records match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Most recent 75 records; all actions use an atomic database state check and an audited superadmin identity.</p>
      </div>

      {selected && (
        <div className="space-y-4 rounded-2xl border border-amber-200 bg-card p-5 shadow-sm dark:border-amber-900">
          <h2 className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="size-5 text-amber-500" aria-hidden/>Review exceptional delivery</h2>
          <p className="text-sm text-muted-foreground">Delivery <code className="font-mono">{selected.id}</code> · {selected.channel} · {selected.status}</p>
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            Never blindly retry UNCERTAIN or possibly accepted SMTP. Confirm provider evidence outside the ERP before marking a possible send accepted. A retry is only valid when the external attempt marker is absent.
          </p>
          <label className="block text-sm font-medium">Operator decision
            <select className="mt-1 block w-full rounded-lg border bg-background px-3 py-2" value={action} onChange={(e) => { setAction(e.target.value as RecoveryAction); setConfirmation(""); }}>
              <option value="retry-pre-send">Retry confirmed pre-send failure</option>
              <option value="confirm-accepted">Confirm externally verified provider acceptance</option>
              <option value="suppress">Suppress (do not retry)</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Decision rationale (required; stored as an audit hash)
            <textarea className="mt-1 block min-h-20 w-full rounded-lg border bg-background p-3 text-sm" maxLength={240} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Document your verification without entering sensitive data."/>
          </label>
          {action === "confirm-accepted" && <label className="block text-sm font-medium">Provider evidence / message receipt
            <input className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm" value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={300} placeholder="Provider-confirmed receipt identifier"/>
          </label>}
          <label className="block text-sm font-medium">Type the exact confirmation phrase
            <code className="mt-1 block select-all break-all rounded-lg bg-muted p-2 text-xs">{expectedConfirmation}</code>
            <input className="mt-2 block w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Exact phrase required"/>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving || confirmation !== expectedConfirmation || reason.length < 16 || (action === "confirm-accepted" && evidence.length < 8)} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><CheckCircle2 className="size-4" aria-hidden/>Apply audited decision</button>
            <button type="button" onClick={resetSelection} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"><RotateCcw className="size-4" aria-hidden/>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
