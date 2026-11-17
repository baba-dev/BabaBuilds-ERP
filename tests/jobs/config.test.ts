import { describe, expect, it } from 'vitest';
import { loadErpJobsConfig } from '@/lib/jobs/config';

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
    });
    expect(c).toMatchObject({ enabled: true, workerEnabled: true, inAppDeadlineEnabled: true, endpoint: url });
  });
});
