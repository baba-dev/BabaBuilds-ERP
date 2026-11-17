"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, Chip, ErrorNote, useAdminJson } from "./admin-kit";

type Check = { key: string; label: string; status: "ok" | "warn" | "missing"; required: boolean; hint: string };
type Status = {
  config: Check[];
  authFailures: { total: number; byReason: Array<{ count: number; provider: string; code: string; reason: string; lastSeenAt: string }> };
  rateLimits: { hits: number; byRoute: Array<{ route: string; count: number }>; topIps: Array<{ ip: string; count: number }> };
  auditChain: { valid: boolean; checked: number; violations: number };
  redis: {
    status: "disabled" | "ready" | "unavailable" | "misconfigured";
    namespace: string | null;
    features: { rateLimits: boolean; cache: boolean; jobs: boolean };
    connections: { cache: { status: string; latencyMs?: number }; queue: { status: string; latencyMs?: number } };
  };
};

const ICON = { ok: CheckCircle2, warn: AlertTriangle, missing: XCircle } as const;
const COLOR = { ok: "text-emerald-600", warn: "text-amber-600", missing: "text-rose-600" } as const;

export function SecurityClient() {
  const { data, error, reload } = useAdminJson<Status>("/api/admin/security/status");
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;
  const missing = data.config.filter((c) => c.status === "missing").length;

  return (
    <div className="space-y-5">
      <Card title="Server configuration" hint="Whether each setting exists, never what it contains." right={missing ? <Chip tone="red">{missing} required missing</Chip> : <Chip tone="green">all required set</Chip>}>
        <ul className="-my-1 divide-y divide-border/60">
          {data.config.map((c) => {
            const Icon = ICON[c.status];
            return (
              <li key={c.key} className="flex items-start gap-3 py-3">
                <Icon className={`mt-0.5 size-4 shrink-0 ${COLOR[c.status]}`} aria-label={c.status === "ok" ? "Set" : c.status === "warn" ? "Optional or weak" : "Missing"} />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{c.label} {c.required ? <span className="text-xs font-normal text-muted-foreground">(required)</span> : <span className="text-xs font-normal text-muted-foreground">(optional)</span>}</p><p className="text-xs text-muted-foreground">{c.hint}</p></div>
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px]">{c.key}</code>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Sign-in failures" hint="Counted since the server last started.">
          <p className="text-3xl font-bold tabular-nums">{data.authFailures.total}</p>
          {data.authFailures.byReason.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None recorded.</p> : (
            <ul className="mt-3 space-y-2 text-sm">{data.authFailures.byReason.map((r, i) => <li key={i} className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="font-medium">{r.reason}</span><span className="block truncate text-xs text-muted-foreground">{r.provider} · {r.code}</span></span><span className="font-semibold tabular-nums">{r.count}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Rate-limit hits" hint="Requests that were slowed down.">
          <p className="text-3xl font-bold tabular-nums">{data.rateLimits.hits}</p>
          {data.rateLimits.byRoute.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None recorded.</p> : (
            <ul className="mt-3 space-y-1.5 text-sm">{data.rateLimits.byRoute.map((r) => <li key={r.route} className="flex justify-between gap-3"><code className="truncate text-xs">{r.route}</code><span className="font-semibold tabular-nums">{r.count}</span></li>)}</ul>
          )}
          {data.rateLimits.topIps.length ? <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">Busiest sources: {data.rateLimits.topIps.map((i) => `${i.ip} (${i.count})`).join(", ")}</p> : null}
        </Card>
      </div>

      <Card title="Redis infrastructure" hint="Status from ERP's own authenticated connections; no connection URLs or credentials shown.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Overall: <span className="capitalize">{data.redis.status}</span></p>
          <Chip tone={data.redis.status === "ready" ? "green" : data.redis.status === "disabled" ? "amber" : "red"}>
            {data.redis.status}
          </Chip>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(["cache", "queue"] as const).map((purpose) => (
            <div key={purpose} className="rounded-lg border p-3 text-sm">
              <p className="font-medium capitalize">{purpose}</p>
              <p className="mt-1 text-muted-foreground">
                {data.redis.connections[purpose].status}
                {data.redis.connections[purpose].latencyMs !== undefined
                  ? " · " + data.redis.connections[purpose].latencyMs + " ms" : ""}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Namespace: {data.redis.namespace ?? "not configured"} ·
          Distributed rate limiting: {data.redis.features.rateLimits ? "enabled" : "disabled"}
        </p>
      </Card>

      <Card title="Tax audit chain" hint="Each tax-rate override is hash-linked to the one before it, so any edit or deletion shows.">
        <p className="flex items-center gap-2 text-sm">{data.auditChain.valid ? <><CheckCircle2 className="size-4 text-emerald-600" aria-hidden />Intact. {data.auditChain.checked} entries verified.</> : <><XCircle className="size-4 text-rose-600" aria-hidden />{data.auditChain.violations} entries failed verification out of {data.auditChain.checked}.</>}</p>
      </Card>

      <Card title="How access to this console works">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2"><CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />A person needs the ADMIN role in the database <b className="text-foreground">and</b> their email in <code>SUPERADMIN_EMAILS</code>. Either alone grants nothing.</li>
          <li className="flex gap-2"><CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />Give someone the role with <code>npm run admin:promote -- email</code> on the server.</li>
          <li className="flex gap-2"><CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />Plan changes, backups and log pruning are written to the activity log with who did them.</li>
        </ul>
      </Card>
    </div>
  );
}
