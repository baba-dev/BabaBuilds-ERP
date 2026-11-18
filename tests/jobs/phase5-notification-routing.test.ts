import { describe, expect, it } from 'vitest';
import {
  notificationRoute, notificationSourceOccurrence, QUEUED_NOTIFICATION_EVENTS,
} from '@/lib/jobs/notification-routing';

const ws = 'cmphase5internal00000001';
const enabled = {
  ERP_REDIS_ENABLED: 'true',
  ERP_REDIS_JOBS_ENABLED: 'true',
  ERP_REDIS_NOTIFICATION_WORKSPACE_IDS: ws,
  ERP_REDIS_NOTIFICATION_EMAIL_ENABLED: 'true',
  ERP_REDIS_NOTIFICATION_PUSH_ENABLED: 'true',
};

describe('Phase 5 C+D channel flags and exact workspace isolation', () => {
  it('is entirely OFF by default', () => {
    expect(notificationRoute(ws, 'PROPOSAL_VIEWED', 'proposal_firstview_001', {}))
      .toEqual({ email: false, push: false });
  });
  it('requires exactly one workspace and stable occurrence; never wildcard/global', () => {
    for (const bad of ['', '*', 'all', ws + ',otherWorkspace', 'otherWorkspace']) {
      expect(notificationRoute(ws, 'PROPOSAL_VIEWED', 'proposal_firstview_001', {
        ...enabled, ERP_REDIS_NOTIFICATION_WORKSPACE_IDS: bad,
      })).toEqual({ email: false, push: false });
    }
    expect(notificationRoute(ws, 'PROPOSAL_VIEWED', undefined, enabled))
      .toEqual({ email: false, push: false });
    expect(notificationRoute(ws, 'PROPOSAL_VIEWED', 'unstable key', enabled))
      .toEqual({ email: false, push: false });
  });
  it('isolates family flags independently and ignores financial events', () => {
    expect(notificationRoute(ws, 'LEAVE_APPROVED', 'leave_req00001_approved', {
      ...enabled, ERP_REDIS_NOTIFICATION_PUSH_ENABLED: 'false',
    })).toEqual({ email: true, push: false });
    expect(notificationRoute(ws, 'LEAVE_APPROVED', 'leave_req00001_approved', {
      ...enabled, ERP_REDIS_NOTIFICATION_EMAIL_ENABLED: 'false',
    })).toEqual({ email: false, push: true });
    for (const event of ['INVOICE_PAID', 'PAYMENT_REMINDER', 'GST_REMINDER', 'BILLING_FAILED']) {
      expect(notificationRoute(ws, event, 'nonfinancial_occurrence', enabled))
        .toEqual({ email: false, push: false });
    }
    expect(QUEUED_NOTIFICATION_EVENTS).toContain('PROPOSAL_VIEWED');
    expect(notificationSourceOccurrence('PROPOSAL_VIEWED', 'proposal_firstview_001'))
      .toBe('notification_proposal_viewed_proposal_firstview_001');
  });
});
