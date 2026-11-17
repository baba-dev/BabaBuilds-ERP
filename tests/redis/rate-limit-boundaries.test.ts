import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

describe('distributed rate-limit integration boundaries', () => {
  it('awaits every route and generic limiter call before continuing the handler', () => {
    for (const path of routeFiles('app')) {
      const source = readFileSync(path, 'utf8');
      for (const method of ['enforceRouteRateLimit', 'checkRateLimit', 'checkPasswordAuthRateLimit', 'recordPasswordAuthFailure']) {
        const calls = [...source.matchAll(new RegExp('\\b' + method + '\\s*\\(', 'g'))];
        for (const match of calls) {
          expect(source.slice(Math.max(0, match.index! - 15), match.index)).toMatch(/await\s+$/);
        }
      }
    }
  });

  it('keeps the second System Health superadmin gate and stops masking infrastructure failures as 404', () => {
    const gate = readFileSync('app/(dashboard)/admin/system-health/_auth.ts', 'utf8');
    const session = readFileSync('lib/admin/session.ts', 'utf8');
    expect(gate).toContain('error instanceof AuthzError');
    expect(gate).toContain('throw error');
    expect(session).toContain('cache(async function getAdminDecision');
  });
});
