import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PayrollNotFoundError } from '@/lib/payroll/service/compensation';
import { PayrollRunError } from '@/lib/payroll/service/generate';
import { PayrollPostingError } from '@/lib/payroll/posting';
import { PayrollPolicyError } from '@/lib/security/payroll-policy';
import { LifecycleError } from '@/lib/payroll/service/lifecycle';
import { RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';

const STATUS: Record<string, number> = {
  NOT_FOUND: 404, PERIOD_CLOSED: 409, RUN_POSTED: 409, RUN_LOCKED: 409, NO_EMPLOYEES: 422, BLOCKED: 422,
  NOT_APPROVED: 409, NOT_POSTED: 409, NOTHING_TO_PAY: 409, ALREADY_PAID: 409, INVALID_TRANSITION: 409, HAS_ERRORS: 422, PAYROLL_SELF_APPROVAL_FORBIDDEN: 403,
};

/** Maps domain errors to clear JSON responses; anything unexpected is logged and returned as a plain 500. */
export function payrollErrorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof RbacDeniedError) return rbacDeniedResponse(error) as NextResponse;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ code: 'INVALID_INPUT', error: 'Check the highlighted fields.', fields: error.flatten().fieldErrors }, { status: 422 });
  }
  if (error instanceof PayrollPolicyError) return NextResponse.json({ code: error.code, error: error.message }, { status: 403 });
  if (error instanceof PayrollRunError || error instanceof PayrollPostingError || error instanceof PayrollNotFoundError || error instanceof LifecycleError) {
    return NextResponse.json({ code: error.code, error: error.message }, { status: STATUS[error.code] ?? 400 });
  }
  console.error(`[payroll/${scope}]`, error);
  return NextResponse.json({ code: 'INTERNAL_ERROR', error: 'Payroll request failed unexpectedly.' }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null);
}
