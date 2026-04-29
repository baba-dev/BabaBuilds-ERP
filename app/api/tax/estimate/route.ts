import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { estimateTax } from '@/lib/tax/engine';
import { checkPermissionSilent } from '@/lib/rbac';
import { resolveTaxJurisdictionForWorkspace } from '@/lib/tax/policy';
import { prisma } from '@/lib/prisma';

type TaxEstimateScenarioPayload = {
  country?: string | null;
  regionCode?: string | null;
  revenue?: number | string | null;
  deductions?: number | string | null;
  serviceScope?: string | null;
  customerScope?: string | null;
  date?: string | null;
  correction?: {
    ratePercent?: number | string | null;
    overrideId?: string | null;
    reason?: string | null;
  } | null;
  override?: {
    ratePercent?: number | string | null;
    overrideId?: string | null;
    reason?: string | null;
  } | null;
};

type SessionWithWorkspace = {
  workspaceId?: string | null;
  user?: { id?: string | null };
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    const userId = session?.user?.id as string | undefined;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
    }

    const canView = await checkPermissionSilent(userId, workspaceId, 'tax.view');
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden', code: 'RBAC_PERMISSION_DENIED' }, { status: 403 });
    }

    const payload = (await request.json()) as TaxEstimateScenarioPayload;

    const jurisdiction = await resolveTaxJurisdictionForWorkspace(prisma, workspaceId);
    const countryForEstimate = (payload.country ?? jurisdiction.workspaceCountryCode).trim() || 'IN';

    const taxEstimate = estimateTax({
      countryCode: countryForEstimate,
      serviceScope: payload.serviceScope,
      regionCode: payload.regionCode,
      revenue: payload.revenue,
      deductions: payload.deductions,
      customerScope: payload.customerScope,
      asOfDate: payload.date,
      overrideRatePercent: payload.correction?.ratePercent ?? payload.override?.ratePercent,
      overrideId: payload.correction?.overrideId ?? payload.override?.overrideId,
      overrideReason: payload.correction?.reason ?? payload.override?.reason ?? 'User-corrected tax rate',
    });

    return NextResponse.json({ taxEstimate });
  } catch (error) {
    console.error('Tax estimate preview error:', error);
    return NextResponse.json(
      { error: 'Failed to estimate tax', code: 'TAX_ESTIMATE_FAILED' },
      { status: 500 }
    );
  }
}
