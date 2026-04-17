import { NextRequest, NextResponse } from 'next/server';

import {
  getPayrollSettingsSnapshot,
  toPaymentSchedule,
  updatePayrollSettings,
} from '@/lib/payroll/settings';
import { requirePayrollSettingsAccess } from '../_shared';

export async function GET() {
  try {
    const { access, response } = await requirePayrollSettingsAccess('workforce.view');
    if (response || !access) return response!;

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json({ paymentSchedule: snapshot.paymentSchedule });
  } catch (error) {
    console.error('[payroll/settings/payment-schedule][GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { access, response } = await requirePayrollSettingsAccess('workforce.settings.manage');
    if (response || !access) return response!;

    const body = (await req.json()) as { paymentSchedule?: unknown };
    if (!body.paymentSchedule) {
      return NextResponse.json({ error: 'paymentSchedule is required' }, { status: 400 });
    }

    await updatePayrollSettings(access.workspaceId, {
      paymentSchedule: toPaymentSchedule(body.paymentSchedule),
    });

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json({ paymentSchedule: snapshot.paymentSchedule });
  } catch (error) {
    console.error('[payroll/settings/payment-schedule][PATCH]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
