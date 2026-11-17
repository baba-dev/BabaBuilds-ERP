import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 4 in-app deadline routing boundary', () => {
  const dispatcher = fs.readFileSync(path.resolve('lib/notifications/dispatcher.ts'), 'utf8');
  const cron = fs.readFileSync(path.resolve('app/api/cron/alerts/route.ts'), 'utf8');
  it('preserves external channels while moving only in-app to the outbox', () => {
    expect(cron).toContain('recordDeadlineInAppJob(');
    expect(cron).toContain('skipInApp: queuedInApp');
    expect(dispatcher).toContain('user.notifyInApp && !options.skipInApp');
    expect(dispatcher).toContain('user.notifyEmail && user.transactionalAlerts');
    expect(dispatcher).toContain('if (user.notifyPush)');
  });
  it('has no HTTP-side BullMQ worker or Queue constructor', () => {
    expect(cron).not.toMatch(/new Worker\(|new Queue\(/);
    expect(dispatcher).not.toMatch(/new Worker\(|new Queue\(/);
  });
});
