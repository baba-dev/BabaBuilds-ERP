import { expect, test } from 'vitest';
import { nextStatusForTransition } from '@/lib/payroll/run-transitions';

test('nextStatusForTransition follows payroll workflow', () => {
  expect(nextStatusForTransition('DRAFT', 'submit_review')).toBe('REVIEW');
  expect(nextStatusForTransition('REVIEW', 'approve')).toBe('APPROVED');
  expect(nextStatusForTransition('REVIEW', 'return_draft')).toBe('DRAFT');
  expect(nextStatusForTransition('APPROVED', 'return_review')).toBe('REVIEW');
});

test('nextStatusForTransition rejects invalid pairs', () => {
  expect(() => nextStatusForTransition('DRAFT', 'approve')).toThrow();
});
