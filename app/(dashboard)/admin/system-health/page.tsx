import { prisma } from '@/lib/prisma';
import { getRedisHealth } from '@/lib/redis/health';
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Bug, Activity, CheckCircle2, AlertTriangle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireSystemHealthSuperAdmin } from "./_auth";

export const dynamic = "force-dynamic";

export default async function SystemHealthPage() {
  await requireSystemHealthSuperAdmin();

  const [errors, redis] = await Promise.all([
    prisma.systemErrorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    getRedisHealth(),
  ]);

  const unresolvedCount = errors.filter(e => e.status === "UNRESOLVED").length;
  const analyzingCount = errors.filter(e => e.status === "ANALYZING").length;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8 text-blue-500" />
            System Health
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring and AI diagnostics for system errors.
          </p>
        </div>
        
        <div className="flex gap-4">
          <div className="flex flex-col items-end border bg-card p-3 rounded-lg shadow-sm">
            <span className="text-sm font-medium text-muted-foreground">Unresolved Issues</span>
            <span className="text-2xl font-bold text-red-500">{unresolvedCount}</span>
          </div>
          <div className="flex flex-col items-end border bg-card p-3 rounded-lg shadow-sm">
            <span className="text-sm font-medium text-muted-foreground">Analyzing</span>
            <span className="text-2xl font-bold text-yellow-500">{analyzingCount}</span>
          </div>
        </div>
      </div>

      {/* Redis foundation is informative, not an ERP availability gate. */}
      <section className="rounded-xl border bg-card text-card-foreground shadow" aria-label="Redis infrastructure health">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-6">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Server className="h-5 w-5" /> Redis infrastructure
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional cache and queue connections. Core ERP uses PostgreSQL independently.
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-sm font-medium capitalize">
            {redis.status}
          </span>
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          {(['cache', 'queue'] as const).map((purpose) => (
            <div key={purpose} className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">{purpose === 'cache' ? 'Cache and rate limits' : 'Background queues'}</p>
              <p className="mt-2 text-sm capitalize text-muted-foreground">
                {redis.connections[purpose].status.replace('-', ' ')}
                {redis.connections[purpose].latencyMs !== undefined
                  ? ` · ${redis.connections[purpose].latencyMs} ms`
                  : ''}
              </p>
            </div>
          ))}
        </div>
        <p className="px-6 pb-5 text-xs text-muted-foreground">
          Namespace: {redis.namespace ?? 'Not configured'} · Redis features remain opt-in.
        </p>
      </section>

      {/* Error Stream List */}
      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6 pb-4 border-b">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Error Stream
          </h3>
        </div>
        
        <div className="divide-y">
          {errors.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-3 opacity-20" />
              <p>No system errors detected recently.</p>
              <p className="text-sm">Your system is healthy!</p>
            </div>
          ) : (
            errors.map((error) => (
              <div key={error.id} className="p-4 hover:bg-muted/50 transition-colors flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {error.errorType}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(error.createdAt), { addSuffix: true })}
                    </span>
                    {error.status === "UNRESOLVED" && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">Unresolved</span>
                    )}
                    {error.status === "ANALYZING" && (
                      <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium">Analyzing (AI)</span>
                    )}
                    {error.status === "RESOLVED" && (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Resolved</span>
                    )}
                  </div>
                  <p className="text-sm text-foreground line-clamp-1">{error.message}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    {error.route && <span>Route: {error.route}</span>}
                    {error.aiDiagnosis && (
                      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <AlertTriangle className="w-3 h-3" /> AI Diagnosed
                      </span>
                    )}
                  </div>
                </div>
                
                <Link href={`/admin/system-health/${error.id}`}>
                  <Button variant="outline" size="sm">Details</Button>
                </Link>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
