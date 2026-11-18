import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEmailBilling } from '../_lib/auth';
import { auditEmailBilling } from '../_lib/audit';
import { mailBillingSettingsPatchSchema, parseJsonBody } from '@/lib/email-billing/validation';

const defaults = { billingModel: 'RECURRING', defaultBillingMode: 'FIXED', defaultCurrency: 'INR', autoCreateReviewItems: true, autoUpdateRetainerQuantities: false, syncFrequencyPreference: 'MANUAL', treatRemovedDomainsAsReviewRequired: true, ignoreAdminMailboxesFromBilling: false };

export async function GET() {
  const auth = await requireEmailBilling('view');
  if ('response' in auth) return auth.response;
  const settings = await prisma.mailBillingSettings.upsert({ where: { workspaceId: auth.workspaceId }, create: { workspaceId: auth.workspaceId, ...defaults }, update: {} });
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireEmailBilling('admin');
  if ('response' in auth) return auth.response;
  try {
    const body = parseJsonBody(mailBillingSettingsPatchSchema, await req.json().catch(() => ({})));
    if (body.defaultPlanId) {
      const plan = await prisma.mailBillingPlan.findFirst({ where: { id: body.defaultPlanId, workspaceId: auth.workspaceId } });
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    const { alertRecipientsJson: _alertRecipientsJson, ...safeBody } = body;
    const before = await prisma.mailBillingSettings.findUnique({ where: { workspaceId: auth.workspaceId }, select: { allowMailboxManagement: true, autoOnboardNewDomains: true, billingModel: true } });
    const changingModel = safeBody.billingModel !== undefined && safeBody.billingModel !== (before?.billingModel ?? 'RECURRING');
    if (changingModel && safeBody.billingModel === 'ACCRUAL') {
      // Both models at once would invoice the same customers twice.
      const live = await prisma.mailBillingSubscription.count({ where: { workspaceId: auth.workspaceId, billingStatus: { in: ['ACTIVE', 'TRIALING', 'REVIEW_REQUIRED'] }, retainer: { status: 'ACTIVE' } } });
      if (live > 0) return NextResponse.json({ error: `${live} subscription${live === 1 ? ' is' : 's are'} still billed by a recurring retainer. Cancel or pause those retainers first, or customers would be invoiced twice.`, code: 'RETAINERS_ACTIVE' }, { status: 409 });
    }
    const enablingAutoOnboard = safeBody.autoOnboardNewDomains === true && !before?.autoOnboardNewDomains;
    if (enablingAutoOnboard && !safeBody.defaultPlanId) return NextResponse.json({ error: 'Choose a default plan before turning on automatic onboarding.' }, { status: 400 });
    // The moment it is switched on is the cut-off: only domains first seen afterwards are ever set up automatically.
    const onboardSince = enablingAutoOnboard ? { autoOnboardSince: new Date() } : {};
    const settings = await prisma.mailBillingSettings.upsert({ where: { workspaceId: auth.workspaceId }, create: { workspaceId: auth.workspaceId, ...defaults, ...safeBody, ...onboardSince, defaultPlanId: safeBody.defaultPlanId || null }, update: { ...safeBody, ...onboardSince, defaultPlanId: safeBody.defaultPlanId || null } });
    if (safeBody.allowMailboxManagement !== undefined && safeBody.allowMailboxManagement !== (before?.allowMailboxManagement ?? false)) {
      auditEmailBilling(auth, safeBody.allowMailboxManagement ? 'mailbox_management_enabled' : 'mailbox_management_disabled', { type: 'mail_billing_settings', id: settings.id }, {}, req);
    }
    if (safeBody.autoOnboardNewDomains !== undefined && safeBody.autoOnboardNewDomains !== (before?.autoOnboardNewDomains ?? false)) {
      auditEmailBilling(auth, safeBody.autoOnboardNewDomains ? 'auto_onboard_enabled' : 'auto_onboard_disabled', { type: 'mail_billing_settings', id: settings.id }, {}, req);
    }
    if (changingModel) auditEmailBilling(auth, 'billing_model_changed', { type: 'mail_billing_settings', id: settings.id }, { from: before?.billingModel ?? 'RECURRING', to: safeBody.billingModel }, req);
    auditEmailBilling(auth, 'settings_updated', { type: 'mail_billing_settings', id: settings.id }, { fields: Object.keys(safeBody) }, req);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid settings' }, { status: 400 });
  }
}
