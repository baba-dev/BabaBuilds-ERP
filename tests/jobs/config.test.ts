import { describe, expect, it } from 'vitest';
import { inAppDeadlineQueueEnabled, loadErpJobsConfig, parseDeadlineCanaryWorkspaces } from '@/lib/jobs/config';

const baseline = { NODE_ENV: 'test', ERP_REDIS_ENABLED: 'true', ERP_REDIS_QUEUE_URL: 'redis://127.0.0.1:6385' };
const url = 'redis://erp_jobs:test-password@127.0.0.1:6387/0';

describe('isolated ERP jobs configuration', () => {
  it('is disabled by default without opening sockets', () => {
    const c = loadErpJobsConfig(baseline);
    expect(c).toMatchObject({ enabled: false, workerEnabled: false, inAppDeadlineEnabled: false, endpoint: null });
  });
  it('rejects any missing parent switch or shared/unsafe endpoint', () => {
    expect(() => loadErpJobsConfig({ ...baseline, ERP_REDIS_JOB_WORKER_ENABLED: 'true' })).toThrow(/JOBS_ENABLED/);
    for (const bad of ['redis://127.0.0.1:6385', 'redis://erp_jobs:p@127.0.0.1:6386',
      'redis://erp_jobs:p@redis.example.com:6387', 'redis://erp_jobs:p@127.0.0.1:6387?db=0']) {
      expect(() => loadErpJobsConfig({ ...baseline, ERP_REDIS_JOBS_ENABLED: 'true', ERP_REDIS_JOB_URL: bad })).toThrow();
    }
  });
  it('requires independently activated worker and pilot flags', () => {
    const c = loadErpJobsConfig({
      ...baseline, ERP_REDIS_JOBS_ENABLED: 'true', ERP_REDIS_JOB_URL: url,
      ERP_REDIS_JOB_WORKER_ENABLED: 'true', ERP_REDIS_INAPP_DEADLINE_ENABLED: 'true',
      ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS: 'cmwkscanary000000000000001',
    });
    expect(c).toMatchObject({
      enabled: true, workerEnabled: true, inAppDeadlineEnabled: true,
      inAppDeadlineWorkspaceIds: ['cmwkscanary000000000000001'], endpoint: url,
    });
  });
  it('never enables a global pilot without an exact workspace ID', () => {
    const enabled = {
      ...baseline, ERP_REDIS_JOBS_ENABLED: 'true',
      ERP_REDIS_JOB_URL: url, ERP_REDIS_JOB_WORKER_ENABLED: 'true',
      ERP_REDIS_INAPP_DEADLINE_ENABLED: 'true',
    };
    expect(() => loadErpJobsConfig(enabled)).toThrow(/WORKSPACE_IDS/);
    expect(inAppDeadlineQueueEnabled('cmwkscanary000000000000001', enabled)).toBe(false);
    for (const invalid of ['*', 'all', 'cmwkscanary000000000000001,cmwksother00000000000002',
      'cmwkscanary000000000000001\nOTHER_ENV=true', '../etc/passwd', 'cmwkscanary000000000000001;DROP']) {
      expect(() => parseDeadlineCanaryWorkspaces(invalid)).toThrow(/workspace ID/);
      expect(inAppDeadlineQueueEnabled('cmwkscanary000000000000001', {
        ...enabled, ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS: invalid,
      })).toBe(false);
    }
  });
  it('targets only the exact internal workspace and defaults to legacy everywhere else', () => {
    const enabled = {
      ...baseline, ERP_REDIS_JOBS_ENABLED: 'true', ERP_REDIS_JOB_URL: url,
      ERP_REDIS_JOB_WORKER_ENABLED: 'true', ERP_REDIS_INAPP_DEADLINE_ENABLED: 'true',
      ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS: 'cmwkscanary000000000000001',
    };
    expect(inAppDeadlineQueueEnabled('cmwkscanary000000000000001', enabled)).toBe(true);
    expect(inAppDeadlineQueueEnabled('cmwksother000000000000002', enabled)).toBe(false);
    expect(inAppDeadlineQueueEnabled('', enabled)).toBe(false);
    expect(inAppDeadlineQueueEnabled('cmwkscanary000000000000001', {
      ...enabled, ERP_REDIS_INAPP_DEADLINE_ENABLED: 'false',
    })).toBe(false);
  });
});
