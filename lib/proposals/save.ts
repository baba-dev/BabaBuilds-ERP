import "server-only";
import { Prisma } from "@prisma/client";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { prisma } from "@/lib/prisma";
import { getNextProposalNo, isUniqueConstraintError } from "@/lib/document-numbering";
import { addProposalEvent } from "@/lib/proposals/events";
import type { ProposalInput } from "@/lib/proposals/validation";
import type { ProposalTotals } from "@/lib/proposals/totals";

type Tx = Prisma.TransactionClient;

function itemRows(input: ProposalInput, totals: ProposalTotals, validTemplateIds: Set<string>) {
  return input.items.map((item, idx) => ({
    serviceTemplateId: item.serviceTemplateId && validTemplateIds.has(item.serviceTemplateId) ? item.serviceTemplateId : null,
    title: item.title,
    description: item.description,
    quantity: item.quantity,
    unitPrice: new Prisma.Decimal(item.unitPrice).toDecimalPlaces(2),
    total: totals.lineTotals[idx],
    isOptional: item.isOptional,
    isSelected: true,
    isRecurring: item.isRecurring,
  }));
}

function milestoneRows(workspaceId: string, input: ProposalInput) {
  return input.milestones.map((m) => ({
    workspaceId,
    title: m.title,
    description: m.description,
    amount: new Prisma.Decimal(m.amount).toDecimalPlaces(2),
    dueDate: m.dueDate ? new Date(m.dueDate) : null,
    status: "PENDING",
  }));
}

async function templateIdSet(tx: Tx, workspaceId: string, input: ProposalInput) {
  const ids = input.items.map((i) => i.serviceTemplateId).filter((id): id is string => Boolean(id));
  if (!ids.length) return new Set<string>();
  const found = await tx.serviceTemplate.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true } });
  return new Set(found.map((t) => t.id));
}

export async function createProposal(args: {
  workspaceId: string;
  actorUserId: string;
  input: ProposalInput;
  totals: ProposalTotals;
  currency: string;
  exchangeRate: number;
}) {
  const { workspaceId, actorUserId, input, totals } = args;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const proposalNo = await getNextProposalNo(tx, workspaceId);
        const templates = await templateIdSet(tx, workspaceId, input);
        const created = await tx.proposal.create({
          data: {
            workspaceId,
            clientId: input.clientId,
            proposalNo,
            title: input.title,
            status: "DRAFT",
            validUntil: new Date(input.validUntil),
            subtotal: totals.subtotal,
            estimatedTax: totals.estimatedTax,
            totalAmount: totals.totalAmount,
            taxRatePercent: totals.taxRatePercent,
            currency: args.currency,
            exchangeRate: new Prisma.Decimal(args.exchangeRate),
            richSections: input.richSections.length ? input.richSections : Prisma.DbNull,
            richMedia: input.richMedia.length ? input.richMedia : Prisma.DbNull,
            items: { create: itemRows(input, totals, templates) },
            billingMilestones: input.milestones.length ? { create: milestoneRows(workspaceId, input) } : undefined,
          },
        });
        await addProposalEvent(tx, { workspaceId, proposalId: created.id, type: "CREATED", actorUserId });
        return created;
      });
    } catch (error) {
      if (attempt < 5 && isUniqueConstraintError(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not generate a unique proposal number.");
}

/** Replaces content in place. Guarded by status so a concurrent client acceptance cannot be overwritten. */
export async function updateProposal(args: {
  workspaceId: string;
  proposalId: string;
  actorUserId: string;
  input: ProposalInput;
  totals: ProposalTotals;
  currency: string;
  exchangeRate: number;
  bumpRevision: boolean;
  editableStatuses: string[];
}) {
  const { workspaceId, proposalId, input, totals } = args;
  return prisma.$transaction(async (tx) => {
    const templates = await templateIdSet(tx, workspaceId, input);
    const res = await tx.proposal.updateMany({
      where: { id: proposalId, workspaceId, status: { in: args.editableStatuses } },
      data: {
        clientId: input.clientId,
        title: input.title,
        validUntil: new Date(input.validUntil),
        subtotal: totals.subtotal,
        estimatedTax: totals.estimatedTax,
        totalAmount: totals.totalAmount,
        taxRatePercent: totals.taxRatePercent,
        currency: args.currency,
        exchangeRate: new Prisma.Decimal(args.exchangeRate),
        richSections: input.richSections.length ? input.richSections : Prisma.DbNull,
        richMedia: input.richMedia.length ? input.richMedia : Prisma.DbNull,
        ...(args.bumpRevision ? { revision: { increment: 1 } } : {}),
      },
    });
    if (res.count === 0) return null;
    await tx.proposalItem.deleteMany({ where: { proposalId } });
    await tx.proposalItem.createMany({ data: itemRows(input, totals, templates).map((r) => ({ ...r, proposalId })) });
    await tx.billingMilestone.deleteMany({ where: { proposalId, workspaceId } });
    if (input.milestones.length) {
      await tx.billingMilestone.createMany({ data: milestoneRows(workspaceId, input).map((r) => ({ ...r, proposalId })) });
    }
    await addProposalEvent(tx, {
      workspaceId,
      proposalId,
      type: "EDITED",
      actorUserId: args.actorUserId,
      metadata: args.bumpRevision ? { revisionBumped: true } : null,
    });
    return tx.proposal.findUnique({ where: { id: proposalId } });
  });
}

/** Base currency + rate for a new/edited proposal. Same currency as the workspace means rate 1. */
export async function resolveCurrency(workspaceId: string, input: Pick<ProposalInput, "currency" | "exchangeRate">) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } });
  const base = workspace?.baseCurrency || "INR";
  const currency = input.currency || base;
  return { currency, exchangeRate: currency === base ? 1 : (input.exchangeRate ?? 1), baseCurrency: base };
}

export function publicProposalUrl(token: string) {
  const origin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://erp.bababuilds.com").replace(/\/$/, "");
  return `${origin}/p/${token}`;
}

export function afterProposalChange(workspaceId: string, action: string) {
  try {
    invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (error) {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "proposal", action, error: String(error) });
  }
}
