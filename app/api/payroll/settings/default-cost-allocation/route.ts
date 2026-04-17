import { NextRequest, NextResponse } from 'next/server';

import {
  getPayrollSettingsSnapshot,
  toDefaultCostAllocation,
  updatePayrollSettings,
} from '@/lib/payroll/settings';
import { requirePayrollSettingsAccess } from '../_shared';

export async function GET() {
  try {
    const { access, response } = await requirePayrollSettingsAccess('workforce.view');
    if (response || !access) return response!;

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json({ defaultCostAllocation: snapshot.defaultCostAllocation });
  } catch (error) {
    console.error('[payroll/settings/default-cost-allocation][GET]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { access, response } = await requirePayrollSettingsAccess('workforce.settings.manage');
    if (response || !access) return response!;

    const body = (await req.json()) as { defaultCostAllocation?: unknown };
    if (!body.defaultCostAllocation) {
      return NextResponse.json({ error: 'defaultCostAllocation is required' }, { status: 400 });
    }

    await updatePayrollSettings(access.workspaceId, {
      defaultCostAllocation: toDefaultCostAllocation(body.defaultCostAllocation),
    });

    const snapshot = await getPayrollSettingsSnapshot(access.workspaceId);
    return NextResponse.json({ defaultCostAllocation: snapshot.defaultCostAllocation });
  } catch (error) {
    console.error('[payroll/settings/default-cost-allocation][PATCH]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
