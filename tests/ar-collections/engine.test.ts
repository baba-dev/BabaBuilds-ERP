import { describe, expect, it } from 'vitest';
import { DEFAULT_DUNNING, bucketOf, daysOverdue, dsoFrom, effectiveDue, nextAction, outstandingBase, priority, riskScore, sanitizeDunning, statusView, type InvoiceLike } from '@/lib/ar/engine';

const now = new Date('2026-03-20T10:00:00');
const d = (s: string) => new Date(`${s}T00:00:00`);
const inv = (over: Partial<InvoiceLike> = {}): InvoiceLike => ({
  invoiceDate: d('2026-02-01'), dueDate: d('2026-03-01'), paymentTermsDays: null, totalAmount: 1000, amountReceived: 0, exchangeRate: 1,
  followUpStatus: null, promiseDate: null, nextFollowUpAt: null, lastReminderSentAt: null, collectionReminders: 0, collectionRiskScore: null, ...over,
});
const act = (i: InvoiceLike, cfg = DEFAULT_DUNNING) => {
  const sv = statusView(i, now, cfg);
  return nextAction(i, sv, daysOverdue(effectiveDue(i), now), outstandingBase(i), cfg, now, 500_000);
};

describe('due dates, balances and aging', () => {
  it('works out the due date from terms when none is set, so old invoices are not "current"', () => {
    const due = effectiveDue({ invoiceDate: d('2026-01-01'), dueDate: null, paymentTermsDays: 15 });
    expect(due.toISOString().slice(0, 10)).toBe(new Date(d('2026-01-16')).toISOString().slice(0, 10));
    expect(daysOverdue(due, now)).toBeGreaterThan(60);
  });
  it('converts what is owed to the workspace currency', () => {
    expect(outstandingBase({ totalAmount: 100, amountReceived: 40, exchangeRate: 80 })).toBe(4800);
    expect(outstandingBase({ totalAmount: 100, amountReceived: 150, exchangeRate: 1 })).toBe(0);
  });
  it('buckets by days overdue', () => {
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(bucketOf)).toEqual(['current', 'd1_30', 'd1_30', 'd31_60', 'd31_60', 'd61_90', 'd61_90', 'd90_plus']);
  });
});

describe('promises, disputes and snoozes', () => {
  it('a promise that has passed is a broken promise', () => {
    expect(statusView(inv({ followUpStatus: 'PROMISE_TO_PAY', promiseDate: d('2026-03-10') }), now, DEFAULT_DUNNING).promiseBroken).toBe(true);
    expect(statusView(inv({ followUpStatus: 'PROMISE_TO_PAY', promiseDate: d('2026-03-25') }), now, DEFAULT_DUNNING).promiseActive).toBe(true);
  });
  it('reminders pause while a promise is live, an invoice is disputed or snoozed', () => {
    expect(act(inv({ followUpStatus: 'PROMISE_TO_PAY', promiseDate: d('2026-03-25') })).kind).toBe('WAIT_PROMISE');
    expect(act(inv({ followUpStatus: 'DISPUTED' })).kind).toBe('RESOLVE_DISPUTE');
    expect(act(inv({ nextFollowUpAt: d('2026-03-30') })).kind).toBe('SNOOZED');
  });
  it('a broken promise means a phone call, not another email', () => {
    expect(act(inv({ followUpStatus: 'PROMISE_TO_PAY', promiseDate: d('2026-03-10') })).kind).toBe('CALL');
  });
});

describe('the reminder ladder', () => {
  it('starts friendly, gets firmer, and respects the gap between reminders', () => {
    expect(act(inv())).toMatchObject({ kind: 'REMIND', tone: 'firm' }); // 19 days overdue, first step (3 days) is due
    expect(act(inv({ collectionReminders: 0, dueDate: d('2026-03-15') }))).toMatchObject({ kind: 'REMIND', tone: 'friendly' });
    expect(act(inv({ collectionReminders: 2, lastReminderSentAt: d('2026-03-19') })).kind).toBe('WAIT_REPLY');
    expect(act(inv({ collectionReminders: 1, lastReminderSentAt: d('2026-03-01') }))).toMatchObject({ kind: 'REMIND' });
  });
  it('when every step has been used it escalates instead of nagging', () => {
    expect(['CALL', 'ESCALATE']).toContain(act(inv({ dueDate: d('2026-02-01'), collectionReminders: 3, lastReminderSentAt: d('2026-03-01') })).kind);
  });
  it('does nothing for invoices not yet due', () => {
    expect(act(inv({ dueDate: d('2026-04-10') })).kind).toBe('NONE');
  });
  it('sanitises settings: sorted steps, clamped numbers, default when empty', () => {
    const c = sanitizeDunning({ autoReminders: true, steps: [{ afterDays: 20, tone: 'final' }, { afterDays: 5, tone: 'bogus' }, { afterDays: -3 }], minGapDays: 999 });
    expect(c.steps).toEqual([{ afterDays: 5, tone: 'friendly' }, { afterDays: 20, tone: 'final' }]);
    expect(c.minGapDays).toBe(60);
    expect(sanitizeDunning({ steps: [] }).steps).toEqual(DEFAULT_DUNNING.steps);
  });
});

describe('risk, priority and DSO', () => {
  it('uses a typed risk score, otherwise works it out from payment history', () => {
    expect(riskScore({ collectionRiskScore: 12 }, null, 50, false)).toEqual({ score: 12, source: 'manual' });
    const good = riskScore({ collectionRiskScore: null }, { avgDaysToPay: 20, lateRate: 0, partialPaymentRate: 0 }, 5, false).score;
    const bad = riskScore({ collectionRiskScore: null }, { avgDaysToPay: 80, lateRate: 0.9, partialPaymentRate: 0.3 }, 60, true).score;
    expect(bad).toBeGreaterThan(good + 30);
  });
  it('ranks big old broken-promise invoices above small paused ones', () => {
    const top = priority({ overdue: 60, outstanding: 200_000, amountReference: 100_000, risk: 70, promiseBroken: true, paused: false, escalated: false });
    const low = priority({ overdue: 60, outstanding: 5_000, amountReference: 100_000, risk: 70, promiseBroken: false, paused: true, escalated: false });
    expect(top).toBeGreaterThan(low);
  });
  it('weights DSO by amount', () => {
    expect(dsoFrom([{ invoiceDate: d('2026-01-01'), paidAt: d('2026-01-11'), amount: 900 }, { invoiceDate: d('2026-01-01'), paidAt: d('2026-02-20'), amount: 100 }])).toBe(14);
    expect(dsoFrom([])).toBeNull();
  });
});
