"use client";

import { useState } from 'react';
import { Card, Chip, ErrorNote, useAdminJson } from './admin-kit';

type Jobs = {
  producerEnabled: boolean; workerEnabled: boolean; pilotEnabled: boolean;
  redisStatus: string; postgresStatus: string;
  workerHeartbeat: 'disabled' | 'ready' | 'degraded' | 'stale' | 'unavailable';
  workerHeartbeatAgeSeconds: number | null;
  jobsRedis: {
    memoryUsedBytes: number | null; memoryLimitBytes: number | null;
    maxmemoryPolicy: string | null; aofEnabled: boolean | null; evictedKeys: number | null;
  };
  pending: number; done: number; failed: number; oldestPendingSeconds: number | null;
  failedJobs: Array<{ id: string; kind: string; attempts: number; createdAt: string }>;
};

export function JobsHealthCard() {
  const { data, error, reload } = useAdminJson<Jobs>('/api/admin/jobs/health');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function retry(id: string) {
    if (busy) return;
    setBusy(id);
    try {
      const response = await fetch('/api/admin/jobs/retry', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotice(response.ok ? 'Job queued for retry.' : 'Retry rejected. Check queue and worker status.');
      reload();
    } catch {
      setNotice('Could not contact ERP job operations.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="ERP background jobs" hint="Isolated PostgreSQL outbox and jobs Redis; this is not the authentication-rate-limit queue.">
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}
      {!data ? <p className="text-sm text-muted-foreground">Loading job diagnostics…</p> : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Chip tone={data.redisStatus === 'ready' ? 'green' : 'amber'}>Redis 6387: {data.redisStatus}</Chip>
            <Chip tone={data.postgresStatus === 'ready' ? 'green' : 'amber'}>Outbox: {data.postgresStatus}</Chip>
            <Chip tone={data.workerEnabled ? 'green' : 'amber'}>Worker flag: {data.workerEnabled ? 'on' : 'off'}</Chip>
            <Chip tone={data.workerHeartbeat === 'ready' ? 'green' : 'amber'}>Live heartbeat: {data.workerHeartbeat}</Chip>
            <Chip tone={data.pilotEnabled ? 'green' : 'amber'}>Pilot: {data.pilotEnabled ? 'on' : 'off'}</Chip>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([['Pending', data.pending], ['Completed', data.done], ['Failed', data.failed]] as const).map(([name, count]) => (
              <div className="rounded-lg border p-3" key={name}>
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="text-xl font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Oldest pending: {data.oldestPendingSeconds === null ? 'none' : data.oldestPendingSeconds + ' sec'} · Producer flag: {data.producerEnabled ? 'on' : 'off'}</p>
          <p className="text-xs text-muted-foreground">
            Heartbeat age: {data.workerHeartbeatAgeSeconds === null ? 'unavailable' : data.workerHeartbeatAgeSeconds + ' sec'}
            {' · '}Redis memory: {data.jobsRedis.memoryUsedBytes === null ? 'unknown' : (data.jobsRedis.memoryUsedBytes / 1048576).toFixed(1) + ' MiB'}
            {data.jobsRedis.memoryLimitBytes === null ? '' : ' / ' + (data.jobsRedis.memoryLimitBytes / 1048576).toFixed(0) + ' MiB'}
            {' · '}AOF: {data.jobsRedis.aofEnabled === null ? 'unknown' : data.jobsRedis.aofEnabled ? 'on' : 'off'}
            {' · '}Evicted keys: {data.jobsRedis.evictedKeys ?? 'unknown'}
          </p>
          {notice ? <p role="status" className="text-xs">{notice}</p> : null}
          {data.failedJobs.length ? (
            <div className="divide-y rounded-lg border">
              {data.failedJobs.map(job => (
                <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div><p className="font-medium">{job.kind}</p><p className="text-xs text-muted-foreground">Attempts: {job.attempts} · {new Date(job.createdAt).toLocaleDateString()}</p></div>
                  <button type="button" disabled={!!busy || !data.workerEnabled} onClick={() => void retry(job.id)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40">
                    {busy === job.id ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
