import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';
import { calculateInvoiceTotals } from '@/lib/invoice/totals';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';
import { withPermission } from '@/lib/rbac';
import { getNextProposalNo, isUniqueConstraintError } from '@/lib/document-numbering';

type ProposalItemInput = {
  serviceTemplateId?: string;
  title: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  isOptional?: boolean;
};
type ProposalMediaItemInput = {
  type: "image" | "video";
  url: string;
  title?: string;
};
type MilestoneInput = {
  title: string;
  description?: string;
  amount: number;
  dueDate?: string;
};
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const proposals = await prisma.proposal.findMany({
      where: { workspaceId: workspaceId },
      include: { client: true, items: true, billingMilestones: true },
      orderBy: { dateCreated: 'desc' }
    });

    return NextResponse.json(proposals);
  } catch (error) {
    console.error("Fetch Proposals Error:", error);
    return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
    const userId = session.user?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // RBAC: creating a proposal requires proposals.create permission
    const perm = await withPermission(userId, workspaceId, 'proposals.create');
    if (!perm.granted) return perm.response;

    const body = await request.json();
    const { clientId, title, validUntil, items, taxRateOverride, richMedia, milestones, richSections } = body as {
      clientId: string;
      title: string;
      validUntil: string;
      items: ProposalItemInput[];
      taxRateOverride?: number;
      richMedia?: ProposalMediaItemInput[];
      milestones?: MilestoneInput[];
      richSections?: any;
    };

    const client = await prisma.client.findFirst({
      where: { id: clientId, workspaceId }
    });
    if (!client) {
      return NextResponse.json({ error: "Invalid client selected." }, { status: 400 });
    }

    if (!client.email || client.email.trim() === '') {
      return NextResponse.json(
        { error: `Cannot create proposal. The client "${client.name}" must have a valid email address on file for digital signatures.` },
        { status: 400 }
      );
    }

    const profile = await prisma.businessProfile.findUnique({
      where: { workspaceId },
      include: { workspace: true }
    });
    const countryCode = profile?.workspace?.countryCode || "IN";
    const defaultTaxRate = (profile as Record<string, unknown> | null)?.defaultTaxRate as number | null ?? null;

    const serviceTemplateIds = items
      .map((item) => item.serviceTemplateId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const templates = serviceTemplateIds.length
      ? await prisma.serviceTemplate.findMany({
          where: { workspaceId, id: { in: serviceTemplateIds } },
          include: { sacCode: true },
        })
      : [];
    const templateMap = new Map(templates.map((template) => [template.id, template]));
    const serviceTaxRates = items
      .map((item) => templateMap.get(item.serviceTemplateId || "")?.sacCode?.igstRate ?? null)
      .filter((rate): rate is number => rate !== null && rate !== undefined);

    const taxResolution = resolveTaxRate({
      countryCode,
      isTaxExempt: Boolean(client.isExport),
      serviceTaxRates,
      workspaceDefaultTaxRate: defaultTaxRate,
      taxRateOverride,
    });

    if (taxResolution.requiresUserInput) {
      return NextResponse.json({
        error: "Tax rate is required before creating this proposal.",
        code: "TAX_RATE_REQUIRED",
        reason: taxResolution.reason,
        countryCode,
        taxLabel: profile?.taxLabel || "Tax",
        candidates: taxResolution.candidates || [],
      }, { status: 422 });
    }

    if (taxResolution.source === 'override' && taxRateOverride !== undefined && taxRateOverride !== null && profile) {
      await prisma.businessProfile.update({
        where: { workspaceId },
        data: { defaultTaxRate: taxResolution.taxRate },
      });
    }

    const pricedLines = items.map((item) => ({
      amount: Number(item.quantity) * Number(item.unitPrice)
    }));
    const totals = calculateInvoiceTotals({
      services: pricedLines,
      isTaxExempt: Boolean(client.isExport),
      defaultTaxRate: taxResolution.taxRate,
    });
    const subtotal = totals.subtotal;
    const estimatedTax = totals.taxAmount;
    const totalAmount = totals.total;

    // Enforce that the sum of all milestones must strictly equal the proposal's grand total
    if (milestones && milestones.length > 0) {
      const milestonesSum = milestones.reduce((sum, m) => sum + Number(m.amount), 0);
      if (Math.abs(milestonesSum - totalAmount) > 0.01) {
        return NextResponse.json({
          error: `The sum of billing milestones (${milestonesSum.toFixed(2)}) must strictly equal the proposal grand total (${totalAmount.toFixed(2)}).`
        }, { status: 400 });
      }
    }

    const normalizedRichMedia = Array.isArray(richMedia)
      ? richMedia
          .map((media) => ({
            type: media.type === "video" ? "video" : "image",
            url: String(media.url ?? "").trim(),
            title: typeof media.title === "string" ? media.title.trim() : "",
          }))
          .filter((media) => media.url.length > 0)
      : [];

    const MAX_NUMBERING_ATTEMPTS = 5;
    let newProposal: Awaited<ReturnType<typeof prisma.proposal.create>> | null = null;
    let proposalNo = "";

    for (let attempt = 1; attempt <= MAX_NUMBERING_ATTEMPTS; attempt += 1) {
      try {
        newProposal = await prisma.$transaction(async (tx) => {
          const nextProposalNo = await getNextProposalNo(tx, workspaceId);
          proposalNo = nextProposalNo;

          return tx.proposal.create({
            data: {
              workspaceId,
              clientId,
              title,
              proposalNo: nextProposalNo,
              validUntil: new Date(validUntil),
              subtotal,
              estimatedTax,
              totalAmount,
              declineReason:
                normalizedRichMedia.length > 0
                  ? JSON.stringify({ richMedia: normalizedRichMedia })
                  : null,
              richSections: richSections ? richSections : undefined,
              status: "SENT",
              items: {
                create: items.map((item) => {
                  const qty = new Prisma.Decimal(Number(item.quantity));
                  const unitPriceD = new Prisma.Decimal(Number(item.unitPrice));
                  const lineTotal = qty.mul(unitPriceD).toDecimalPlaces(2);
                  return {
                    serviceTemplateId: templateMap.has(item.serviceTemplateId || "") ? item.serviceTemplateId : null,
                    title: item.title,
                    description: item.description || null,
                    quantity: Number(item.quantity),
                    unitPrice: unitPriceD.toNumber(),
                    total: lineTotal.toNumber(),
                    isOptional: Boolean(item.isOptional),
                    isSelected: true
                  };
                })
              },
              billingMilestones: milestones && milestones.length > 0 ? {
                create: milestones.map((m) => ({
                  workspaceId,
                  title: m.title,
                  description: m.description || null,
                  amount: new Prisma.Decimal(m.amount),
                  dueDate: m.dueDate ? new Date(m.dueDate) : null,
                  status: 'PENDING'
                }))
              } : undefined,
            }
          });
        });
        break;
      } catch (error) {
        if (attempt < MAX_NUMBERING_ATTEMPTS && isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    if (!newProposal) {
      return NextResponse.json({ error: "Could not generate a unique proposal number." }, { status: 409 });
    }

    // Fire notification (fire-and-forget)
    dispatchNotification({
      event: 'PROPOSAL_CREATED',
      workspaceId,
      data: {
        proposalNo,
        clientName: client.name,
        amount: String(totalAmount),
      },
    }).catch(() => null);

logActivity({
  action: "proposal_created",
  status: "SUCCESS",
  workspaceId,
  actor: { userId: session.user?.id, email: session.user?.email },
  entity: { type: "proposal", id: newProposal.id },
  request,
});

try {
  invalidateDashboardCacheForWorkspace(workspaceId);
} catch (error) {
  noteDashboardCacheIncident("invalidationFailures", {
    workspaceId,
    entity: "proposal",
    action: "create",
    error: String(error),
  });
}

    return NextResponse.json({ success: true, proposal: newProposal });
  } catch (error) {
    console.error("Proposal Creation Error:", error);
    logActivity({
      action: "proposal_created",
      status: "FAILURE",
      workspaceId: null,
      request,
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 });
  }
}
