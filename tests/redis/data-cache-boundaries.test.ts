import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(name);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [name] : [];
  });
}

describe('Phase 3 cache security and post-commit boundaries', () => {
  it('awaits every existing distributed invalidation and wrapper call', () => {
    const guarded = [
      'invalidateDashboardCacheForWorkspace',
      'invalidateInvoiceCaches',
      'afterProposalChange', 'afterRetainerChange',
    ];
    for (const file of [...sourceFiles('app'), ...sourceFiles('lib')]) {
      const src = readFileSync(file, 'utf8');
      for (const name of guarded) {
        const regex = new RegExp('\\b' + name + '\\s*\\(', 'g');
        for (const match of src.matchAll(regex)) {
          const before = src.slice(Math.max(0, match.index! - 30), match.index!);
          if (/\bfunction\s+$/.test(before)) continue;
          expect(before.trimEnd(), 'missing await in ' + file + ' for ' + name).toMatch(/\bawait$/);
        }
      }
    }
  });

  it('revalidates permission before every dashboard hit', () => {
    const source = readFileSync('app/api/dashboard/route.ts', 'utf8');
    const gate = source.indexOf('resolveLiveCacheAuthorization(userId, workspaceId');
    const redis = source.indexOf("cachedDataSnapshot(");
    expect(gate).toBeGreaterThan(0);
    expect(redis).toBeGreaterThan(gate);
    expect(source).toContain("'dashboard.view'");
  });

  it('allows shared Redis only on interactive built-ins; exports and cron remain DB-backed', () => {
    const engine = readFileSync('lib/reporting/engine.ts', 'utf8');
    expect(engine).toContain('REDIS_INTERACTIVE_REPORTS');
    expect(engine).toContain('options.interactiveCache');
    expect(engine).toContain('resolveLiveCacheAuthorization');
    expect(readFileSync('app/api/reporting/run/route.ts', 'utf8')).toContain('interactiveCache: true');
    expect(readFileSync('app/api/reporting/dashboard-cards/route.ts', 'utf8')).toContain('interactiveCache: true');
    for (const path of [
      'app/api/reporting/export/route.ts',
      'app/api/reporting/shares/route.ts',
      'lib/reporting/views.ts',
    ]) {
      expect(readFileSync(path, 'utf8')).not.toContain('interactiveCache: true');
    }
  });

  it('keeps both cache modes off by default and Phase 2 rate limits independent', () => {
    const config = readFileSync('lib/redis/config.ts', 'utf8');
    const data = readFileSync('lib/redis/data-cache.ts', 'utf8');
    expect(config).toContain('ERP_REDIS_DASHBOARD_CACHE_ENABLED');
    expect(config).toContain('ERP_REDIS_REPORT_CACHE_ENABLED');
    expect(config).toContain('ERP_REDIS_DATA_CACHE_URL');
    expect(data).toContain("getRedisClient('dataCache'");
    expect(data).not.toContain("getRedisClient('cache'");
    expect(data).not.toContain("getRedisClient('queue'");
  });
});
