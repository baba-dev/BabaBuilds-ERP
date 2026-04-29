import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { estimateTax, TaxEngineValidationError } from '@/lib/tax/engine';
import { checkPermission } from '@/lib/rbac';
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
  fiscalYear?: string | null;
  taxType?: 'income_tax' | 'gst' | 'vat' | 'sales_tax' | null;
  taxRegime?: 'new' | 'old' | null;
  taxpayerType?: 'individual' | 'huf' | 'aop' | 'boi' | 'ajp' | 'company' | 'firm' | 'other' | null;
  residentialStatus?: 'resident' | 'non_resident' | 'not_ordinarily_resident' | null;
  isSalaried?: boolean | null;
  applyStandardDeduction?: boolean | null;
  specialRateIncome?: number | string | null;
  correction?: { ratePercent?: number | string | null; overrideId?: string | null; reason?: string | null } | null;
  override?: { ratePercent?: number | string | null; overrideId?: string | null; reason?: string | null } | null;
};

type SessionWithWorkspace = { workspaceId?: string | null; user?: { id?: string | null } };

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    const userId = session?.user?.id as string | undefined;
    if (!workspaceId || !userId) return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_UNAUTHORIZED' }, { status: 401 });

    const canView = await checkPermission(userId, workspaceId, 'tax.view');
    if (!canView) return NextResponse.json({ error: 'Forbidden', code: 'RBAC_PERMISSION_DENIED' }, { status: 403 });

    const payload = (await request.json()) as TaxEstimateScenarioPayload;
    const jurisdiction = await resolveTaxJurisdictionForWorkspace(prisma, workspaceId);
    const countryForEstimate = (payload.country ?? jurisdiction.workspaceCountryCode).trim() || 'IN';

    const taxEstimate = estimateTax({
      countryCode: countryForEstimate, serviceScope: payload.serviceScope, regionCode: payload.regionCode,
      revenue: payload.revenue, deductions: payload.deductions, customerScope: payload.customerScope,
      asOfDate: payload.date, fiscalYear: payload.fiscalYear, taxType: payload.taxType ?? (countryForEstimate === 'IN' ? 'income_tax' : undefined),
      taxRegime: payload.taxRegime ?? 'new', taxpayerType: payload.taxpayerType ?? 'individual', residentialStatus: payload.residentialStatus ?? 'resident',
      isSalaried: payload.isSalaried ?? false, applyStandardDeduction: payload.applyStandardDeduction ?? false, specialRateIncome: payload.specialRateIncome ?? 0,
      overrideRatePercent: payload.correction?.ratePercent ?? payload.override?.ratePercent,
      overrideId: payload.correction?.overrideId ?? payload.override?.overrideId,
      overrideReason: payload.correction?.reason ?? payload.override?.reason ?? 'User-corrected tax rate',
    });

    return NextResponse.json({ taxEstimate });
  } catch (error) {
    if (error instanceof TaxEngineValidationError) {
      return NextResponse.json({ error: error.message, code: error.code, ...(error.details ?? {}) }, { status: 422 });
    }
    console.error('Tax estimate preview error:', error);
    return NextResponse.json({ error: 'Failed to estimate tax', code: 'TAX_ESTIMATE_FAILED' }, { status: 500 });
  }
}
