import type { PayrollRunStatus } from '@prisma/client';

export type PayrollRunTransitionAction =
  | 'submit_review'
  | 'approve'
  | 'return_draft'
  | 'return_review';

const ORDER: PayrollRunStatus[] = ['DRAFT', 'REVIEW', 'APPROVED', 'POSTED'];

export function nextStatusForTransition(
  current: PayrollRunStatus,
  action: PayrollRunTransitionAction,
): PayrollRunStatus {
  switch (action) {
    case 'submit_review':
      if (current !== 'DRAFT') {
        throw new Error('Invalid transition: submit_review requires DRAFT.');
      }
      return 'REVIEW';
    case 'approve':
      if (current !== 'REVIEW') {
        throw new Error('Invalid transition: approve requires REVIEW.');
      }
      return 'APPROVED';
    case 'return_draft':
      if (current !== 'REVIEW') {
        throw new Error('Invalid transition: return_draft requires REVIEW.');
      }
      return 'DRAFT';
    case 'return_review':
      if (current !== 'APPROVED') {
        throw new Error('Invalid transition: return_review requires APPROVED.');
      }
      return 'REVIEW';
    default: {
      const _x: never = action;
      throw new Error(`Unknown action: ${_x}`);
    }
  }
}

export function runIndex(status: PayrollRunStatus): number {
  return ORDER.indexOf(status);
}
