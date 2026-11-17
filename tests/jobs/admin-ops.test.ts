import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('ERP jobs operations authorization', () => {
  it('requires verified superadmin before exposing job status or retrying', () => {
    for (const file of ['app/api/admin/jobs/health/route.ts', 'app/api/admin/jobs/retry/route.ts']) {
      const s = fs.readFileSync(file, 'utf8');
      expect(s).toContain('verifySuperAdmin()');
      expect(s).not.toContain('return Response.json({ error: error.message');
    }
  });
  it('does not expose outbox payload in health responses', () => {
    const s = fs.readFileSync('lib/jobs/ops-health.ts', 'utf8');
    expect(s).not.toContain('payloadJson');
    expect(s).not.toContain('ERP_REDIS_JOB_URL=');
  });
});
