import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';
import { mailBillingSettingsPatchSchema, parseJsonBody } from '@/lib/email-billing/validation';

const defaults = { defaultBillingMode: 'FIXED', defaultCurrency: 'INR', autoCreateReviewItems: true, autoUpdateRetainerQuantities: false, syncFrequencyPreference: 'MANUAL', treatRemovedDomainsAsReviewRequired: true, ignoreAdminMailboxesFromBilling: false };

export async function GET() {
  const auth = await requireEmailBilling('invoices.view');
  if ('response' in auth) return auth.response;
  const settings = await prisma.mailBillingSettings.upsert({ where: { workspaceId: auth.workspaceId }, create: { workspaceId: auth.workspaceId, ...defaults }, update: {} });
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireEmailBilling('workspace.manage_settings');
  if ('response' in auth) return auth.response;
  try {
    const body = parseJsonBody(mailBillingSettingsPatchSchema, await req.json().catch(() => ({})));
    if (body.defaultPlanId) {
      const plan = await prisma.mailBillingPlan.findFirst({ where: { id: body.defaultPlanId, workspaceId: auth.workspaceId } });
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    const { alertRecipientsJson: _alertRecipientsJson, ...safeBody } = body;
    const settings = await prisma.mailBillingSettings.upsert({ where: { workspaceId: auth.workspaceId }, create: { workspaceId: auth.workspaceId, ...defaults, ...safeBody, defaultPlanId: safeBody.defaultPlanId || null }, update: { ...safeBody, defaultPlanId: safeBody.defaultPlanId || null } });
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid settings' }, { status: 400 });
  }
}
