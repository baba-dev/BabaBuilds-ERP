import { NextRequest, NextResponse } from 'next/server';

import {
  getPayrollSettingsSnapshot,
  toStatutoryRules,
  updatePayrollSettings,
} from '@/lib/payroll/settings';
import { requirePayrollSettingsAccess } from '../_shared';

export async function GET() {
  try {
    const { access, response } = await requirePayrollSettingsAccess('payroll.view');
    if (response || !access) return response!;

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json({ statutoryRules: snapshot.statutoryRules });
  } catch (error) {
    console.error('[payroll/settings/statutory-rules][GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { access, response } = await requirePayrollSettingsAccess('payroll.settings.manage');
    if (response || !access) return response!;

    const body = (await req.json()) as { statutoryRules?: unknown };
    if (!body.statutoryRules) {
      return NextResponse.json({ error: 'statutoryRules is required' }, { status: 400 });
    }

    await updatePayrollSettings(access.workspaceId, {
      statutoryRules: toStatutoryRules(body.statutoryRules),
    });

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json({ statutoryRules: snapshot.statutoryRules });
  } catch (error) {
    console.error('[payroll/settings/statutory-rules][PATCH]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
