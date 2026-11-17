import { describe, expect, it } from 'vitest';
// This module imports server-only and Prisma; the pure occurrence-key contract
// can be checked statically until the PostgreSQL integration gate exercises it.
import { deadlineOccurrenceKey, DEADLINE_KIND } from '@/lib/jobs/outbox';

describe('ERP job outbox key contract', () => {
  it('is stable for the same task and due date', () => {
    const when = new Date('2026-11-20T12:00:00Z');
    const first = deadlineOccurrenceKey('cktask123', when);
    expect(deadlineOccurrenceKey('cktask123', new Date('2026-11-20T20:00:00Z'))).toBe(first);
    expect(first).toContain('2026-11-20');
    expect(DEADLINE_KIND).toBe('inapp_task_deadline_v1');
  });
  it('rejects untrusted identifiers and dates before DB access', () => {
    expect(() => deadlineOccurrenceKey('a:b', new Date())).toThrow();
    expect(() => deadlineOccurrenceKey('cktask123', new Date('bad'))).toThrow();
  });
});
