import { describe, expect, it } from 'vitest';
import {
  canonicalReportRecipients, reportOccurrenceKey,
  reportQueueEnabled, reportQueueWorkspace,
} from '@/lib/jobs/report-routing';

const workspace = 'cmphase5reportinternal001';
const env = {
  ERP_REDIS_ENABLED: 'true',
  ERP_REDIS_JOBS_ENABLED: 'true',
  ERP_REDIS_REPORT_EMAIL_ENABLED: 'true',
  ERP_REDIS_REPORT_WORKSPACE_ID: workspace,
};

describe('Phase 5 E report routing isolation', () => {
  it('keeps the new family OFF by default', () => {
    expect(reportQueueWorkspace({})).toBeNull();
    expect(reportQueueEnabled(workspace, {})).toBe(false);
  });
  it('requires one exact approved workspace, never wildcard, CSV or staging', () => {
    expect(reportQueueEnabled(workspace, env)).toBe(true);
    expect(reportQueueEnabled('otherWorkspace000001', env)).toBe(false);
    for (const raw of ['', '*', 'all', workspace + ',otherWorkspace000001']) {
      expect(reportQueueWorkspace({ ...env, ERP_REDIS_REPORT_WORKSPACE_ID: raw })).toBeNull();
    }
    expect(reportQueueEnabled(workspace, { ...env, ERP_STAGING_MODE: '1' })).toBe(false);
  });
  it('deduplicates a source occurrence by report ID and precise UTC due clock', () => {
    const date = new Date('2026-11-18T06:30:00.000Z');
    expect(reportOccurrenceKey('cmreportview00001', date)).toBe(
      'report_cmreportview00001_due_20261118T063000000Z');
    expect(() => reportOccurrenceKey('../unsafe', date)).toThrow();
  });
  it('normalizes recipients and rejects invalid or oversized batches', () => {
    expect(canonicalReportRecipients(' A@Example.com, a@example.com  B@EXAMPLE.COM '))
      .toEqual(['a@example.com', 'b@example.com']);
    expect(canonicalReportRecipients('not-an-email')).toBeNull();
    expect(canonicalReportRecipients(Array.from({ length: 11 }, (_, i) => 'a' + i + '@example.com').join(','))).toBeNull();
  });
  it('permits only explicit sitewide report routing, not wildcard or missing approval', () => {
    const global = {
      ...env,
      ERP_REDIS_EXTERNAL_DELIVERY_SCOPE: 'sitewide',
      ERP_REDIS_SITEWIDE_DELIVERY_APPROVED: 'true',
      ERP_REDIS_REPORT_WORKSPACE_ID: '',
    };
    expect(reportQueueEnabled(workspace, global)).toBe(true);
    expect(reportQueueEnabled('cmotherworkspace0001', global)).toBe(true);
    expect(reportQueueEnabled('cmotherworkspace0001', {
      ...global, ERP_REDIS_SITEWIDE_DELIVERY_APPROVED: 'false',
    })).toBe(false);
    expect(reportQueueEnabled('cmotherworkspace0001', {
      ...global, ERP_REDIS_EXTERNAL_DELIVERY_SCOPE: '*',
    })).toBe(false);
    expect(reportQueueEnabled('cmotherworkspace0001', {
      ...global, ERP_REDIS_REPORT_EMAIL_ENABLED: 'false',
    })).toBe(false);
  });

});
