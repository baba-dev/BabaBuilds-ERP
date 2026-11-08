import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { addProposalEvent } from "@/lib/proposals/events";
import { afterProposalChange } from "@/lib/proposals/save";
import { getNextProposalNo, isUniqueConstraintError } from "@/lib/document-numbering";

/** Copies a proposal into a fresh draft (new number, new link, no view history). Prices are kept as quoted. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProposalAccess("proposals.create");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId } = auth.access;
  const { id } = await params;

  const src = await prisma.proposal.findFirst({ where: { id, workspaceId }, include: { items: true, billingMilestones: true } });
  if (!src) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");

  const validUntil = new Date(Math.max(src.validUntil.getTime(), Date.now() + 14 * 86_400_000));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const copy = await prisma.$transaction(async (tx) => {
        const proposalNo = await getNextProposalNo(tx, workspaceId);
        const created = await tx.proposal.create({
          data: {
            workspaceId,
            clientId: src.clientId,
            proposalNo,
            title: `${src.title} (copy)`.slice(0, 200),
            status: "DRAFT",
            validUntil,
            subtotal: src.subtotal,
            estimatedTax: src.estimatedTax,
            totalAmount: src.totalAmount,
            currency: src.currency,
            exchangeRate: src.exchangeRate,
            taxRatePercent: src.taxRatePercent,
            richSections: src.richSections ?? Prisma.DbNull,
            richMedia: src.richMedia ?? Prisma.DbNull,
            items: {
              create: src.items.map((i) => ({
                serviceTemplateId: i.serviceTemplateId,
                title: i.title,
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.total,
                isOptional: i.isOptional,
                isSelected: true,
                isRecurring: i.isRecurring,
              })),
            },
            billingMilestones: src.billingMilestones.length
              ? { create: src.billingMilestones.map((m) => ({ workspaceId, title: m.title, description: m.description, amount: m.amount, dueDate: m.dueDate, status: "PENDING" })) }
              : undefined,
          },
        });
        await addProposalEvent(tx, { workspaceId, proposalId: created.id, type: "CREATED", message: `Duplicated from ${src.proposalNo}`, actorUserId: userId });
        return created;
      });
      afterProposalChange(workspaceId, "duplicate");
      return NextResponse.json({ success: true, proposal: { id: copy.id, proposalNo: copy.proposalNo } });
    } catch (error) {
      if (attempt < 5 && isUniqueConstraintError(error)) continue;
      console.error("Proposal duplicate error:", error);
      return proposalError(500, "PROPOSAL_DUPLICATE_FAILED", "Failed to duplicate proposal.");
    }
  }
  return proposalError(409, "NUMBERING_CONFLICT", "Could not generate a unique proposal number.");
}
