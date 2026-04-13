import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';
import { logActivity } from '@/lib/security/activity-log';

export async function GET() {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. FETCH RETAINERS (Include Client data for the UI)
    const retainers = await prisma.retainer.findMany({
      where: { workspaceId },
      include: { 
        client: {
          select: { name: true, email: true } // We only need name and email for the UI
        } 
      },
      orderBy: { nextBillingDate: 'asc' } // Show closest billing dates first
    });

    return NextResponse.json(retainers);
  } catch (error) {
    console.error("Fetch Retainers Error:", error);
    return NextResponse.json({ error: 'Failed to fetch retainers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const body = await request.json();
    const { clientId, serviceName, amount, frequency, autoAppendMonth, nextBillingDate, serviceTemplateId, taxRateOverride } = body;

    // 2. VALIDATE CLIENT OWNERSHIP
    const client = await prisma.client.findFirst({ 
      where: { id: clientId, workspaceId } 
    });
    if (!client) {
      return NextResponse.json({ error: "Invalid client selected." }, { status: 400 });
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { workspaceId },
      include: { workspace: true }
    });
    const serviceTemplate = serviceTemplateId
      ? await prisma.serviceTemplate.findFirst({
          where: { id: serviceTemplateId, workspaceId },
          include: { sacCode: true },
        })
      : null;

    const taxResolution = resolveTaxRate({
      countryCode: profile?.workspace?.countryCode || "IN",
      isTaxExempt: Boolean(client.isExport),
      serviceTaxRates: [serviceTemplate?.sacCode?.igstRate ?? null],
      workspaceDefaultTaxRate: (profile as any)?.defaultTaxRate ?? null,
      taxRateOverride,
    });

    if (taxResolution.requiresUserInput) {
      return NextResponse.json({
        error: "Tax rate is required before creating this retainer.",
        code: "TAX_RATE_REQUIRED",
        reason: taxResolution.reason,
        countryCode: profile?.workspace?.countryCode || "IN",
        taxLabel: profile?.taxLabel || "Tax",
        candidates: taxResolution.candidates || [],
      }, { status: 422 });
    }

    if (taxResolution.source === 'override' && taxRateOverride !== undefined && taxRateOverride !== null && taxRateOverride !== '' && profile) {
      await prisma.businessProfile.update({
        where: { workspaceId },
        data: { defaultTaxRate: taxResolution.taxRate },
      });
    }

    // 3. CREATE THE AUTOMATED LOOP
    const newRetainer = await prisma.retainer.create({
      data: {
        workspaceId,
        clientId,
        serviceName,
        amount: Number(amount),
        frequency: frequency || "MONTHLY",
        autoAppendMonth: Boolean(autoAppendMonth),
        nextBillingDate: new Date(nextBillingDate),
        status: "ACTIVE", // Automatically starts running
        sacCode: body.sacCode || serviceTemplate?.sacCode?.code || null, // Optional: inherited from profile if blank
        taxRate: taxResolution.taxRate,
      } as any
    });


    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'retainer', action: 'create', error: String(error) });
    }

    logActivity({
      action: "retainer_created",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: (session as any).user?.id, email: (session as any).user?.email },
      entity: { type: "retainer", id: newRetainer.id },
      request,
    });

    return NextResponse.json({ success: true, retainer: newRetainer });
  } catch (error) {
    console.error("Retainer Creation Error:", error);
    logActivity({
      action: "retainer_created",
      status: "FAILURE",
      workspaceId: (await getServerSession(authOptions) as any)?.workspaceId ?? null,
      request,
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'Failed to configure retainer engine' }, { status: 500 });
  }
}
