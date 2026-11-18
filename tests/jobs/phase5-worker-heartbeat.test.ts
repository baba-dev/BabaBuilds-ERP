import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parseRedisInfo, parseRedisInfoNumber, parseWorkerHeartbeat } from '@/lib/jobs/heartbeat';

describe('Phase 5 worker liveness, isolated Redis and health safety', () => {
  const NOW = 1795000000000;
  it('requires a fresh real worker heartbeat; a config flag alone is insufficient', () => {
    expect(parseWorkerHeartbeat('ok:' + (NOW - 10_000), NOW)).toEqual({ status: 'ready', ageSeconds: 10 });
    expect(parseWorkerHeartbeat('degraded:' + (NOW - 12_000), NOW)).toEqual({ status: 'degraded', ageSeconds: 12 });
    for (const bad of [null, '', 'ok:nope', 'ok:' + (NOW - 50_000), 'ok:' + (NOW + 3_000), 'ok:123']) {
      expect(parseWorkerHeartbeat(bad, NOW).status).toBe('stale');
    }
  });
  it('only extracts safe Redis metrics, never raw passwords or job details', () => {
    const m = '# Memory\r\nused_memory:12345\r\nmaxmemory:134217728\r\nmaxmemory_policy:noeviction\r\n';
    expect(parseRedisInfoNumber(m, 'used_memory')).toBe(12345);
    expect(parseRedisInfoNumber(m, 'maxmemory')).toBe(134217728);
    expect(parseRedisInfo(m, 'maxmemory_policy')).toBe('noeviction');
    expect(parseRedisInfoNumber('aof_enabled:1\r\n', 'aof_enabled')).toBe(1);
    expect(parseRedisInfoNumber('evicted_keys:0\n', 'evicted_keys')).toBe(0);
    expect(parseRedisInfoNumber('used_memory:1.5', 'used_memory')).toBeNull();
    expect(parseRedisInfo('secret:x', 'secret with unsafe name')).toBeNull();
  });
  it('the marker lives inside dedicated jobs ACL namespace, expires and is refreshed only by the worker', () => {
    const worker = fs.readFileSync('ops/erp-worker/worker.mjs', 'utf8');
    const health = fs.readFileSync('lib/jobs/ops-health.ts', 'utf8');
    expect(worker).toContain("prefix + ':worker:heartbeat'");
    expect(worker).toContain('HEARTBEAT_TTL_MS = 35_000');
    expect(worker).toContain("await client.set(heartbeatKey");
    expect(worker).toContain('await heartbeat(reconcilerHealthy)');
    expect(health).toContain("config.namespace + ':jobs:worker:heartbeat'");
    expect(health).not.toContain('payloadJson');
  });
});
