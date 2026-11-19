import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Phase 5 sitewide release operator', () => {
  const operatorPath = path.resolve('scripts/operations/erp-phase5-sitewide-activate.sh');
  const workflowPath = path.resolve('.github/workflows/erp-phase5-sitewide.yml');
  const pausePath = path.resolve('scripts/operations/erp-phase5-sitewide-pause.sh');
  const script = readFileSync(operatorPath, 'utf8');
  const workflow = readFileSync(workflowPath, 'utf8');

  it('is valid Bash and blocks before changes when immutable release or old claims differ', () => {
    expect(() => execFileSync('bash', ['-n', operatorPath], { timeout: 15000 }))
      .not.toThrow();
    expect(script).toContain('DEPLOY_SHA');
    expect(script).toContain('sitewide-activated.sha');
    expect(script).toContain('existing unresolved external deliveries');
    expect(script).toContain("NO_MIGRATIONS_NO_GLOBAL_CRON_NO_COHOSTED_RESTARTS");
    expect(script).not.toMatch(/\b(?:FLUSHDB|FLUSHALL|prisma migrate deploy|psql.*UPDATE)\b/i);
  });

  it('restarts only the ERP web and worker, never sibling apps or financial cron', () => {
    expect(script).toContain('systemctl restart "$web"');
    expect(script).toContain('systemctl restart "$worker"');
    expect(script).not.toContain('systemctl restart menuminute');
    expect(script).not.toContain('systemctl restart clubkeep');
    expect(script).not.toContain('/api/cron/alerts');
  });

  it('ships a valid emergency pause that does not replay unknown provider outcomes', () => {
    expect(() => execFileSync('bash', ['-n', pausePath], { timeout: 15000 }))
      .not.toThrow();
    const pause = readFileSync(pausePath, 'utf8');
    expect(pause).toContain('ERP_PHASE5_SITEWIDE_EXTERNAL_DELIVERY_PAUSED');
    expect(pause).toContain('ERP_REDIS_REPORT_EMAIL_ENABLED=false');
    expect(pause).not.toContain('FLUSHALL');
    expect(pause).not.toContain('prisma migrate');
    expect(workflow).toContain('5e7b277517d1a516b23fd9d30ced6537c0d3677b');
  });

  it('accepts only a trusted completed latest-main ERP deployment and pinned operator', () => {
    expect(workflow).toContain('workflow_run');
    expect(workflow).toContain('Stale/untrusted ERP deployment');
    expect(workflow).toContain('Deploy verified ARM64 release to ERP systemd');
    expect(workflow).toContain('059d5c150e675eaf4887897d19f8d6579593a133');
    expect(workflow).toContain('environment: erp-production');
  });
});
