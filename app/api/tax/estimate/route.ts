import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { estimateTax } from '@/lib/tax/engine';

type TaxEstimateScenarioPayload = {
  country?: string | null;
  revenue?: number | string | null;
  deductions?: number | string | null;
  serviceScope?: string | null;
  customerScope?: string | null;
  date?: string | null;
  override?: {
    ratePercent?: number | string | null;
    overrideId?: string | null;
    reason?: string | null;
  } | null;
};

type SessionWithWorkspace = {
  workspaceId?: string | null;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });
    }

    const payload = (await request.json()) as TaxEstimateScenarioPayload;

    const taxEstimate = estimateTax({
      countryCode: payload.country,
      revenue: payload.revenue,
      deductions: payload.deductions,
      serviceScope: payload.serviceScope,
      customerScope: payload.customerScope,
      asOfDate: payload.date,
      overrideRatePercent: payload.override?.ratePercent,
      overrideId: payload.override?.overrideId,
      overrideReason: payload.override?.reason,
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
