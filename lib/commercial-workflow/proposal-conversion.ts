import { prisma } from '@/lib/prisma';
import { ProposalConversionType } from '@prisma/client';
import { logActivity } from '@/lib/security/activity-log';

export async function createProposalConversion({
  workspaceId,
  proposalId,
  conversionType,
  actorUserId,
  invoiceId,
  retainerId,
  shopOrderId,
}: {
  workspaceId: string;
  proposalId: string;
  conversionType: ProposalConversionType;
  actorUserId: string | null;
  invoiceId?: string;
  retainerId?: string;
  shopOrderId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Calculate and update Proposal's firstConvertedAt safely
    const proposal = await tx.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) throw new Error('Proposal not found');

    const updateData: any = {};
    if (!proposal.firstConvertedAt) {
      updateData.firstConvertedAt = new Date();
    }

    if (Object.keys(updateData).length > 0) {
      await tx.proposal.update({
        where: { id: proposalId },
        data: updateData,
      });
    }

    // 2. Create the Conversion Tracking Record
    const conversion = await tx.proposalConversion.create({
      data: {
        workspaceId,
        proposalId,
        conversionType,
        convertedByUserId: actorUserId,
        invoiceId: invoiceId || null,
        retainerId: retainerId || null,
        shopOrderId: shopOrderId || null,
      },
    });

    // 3. Log Activity
    logActivity({
      action: "proposal_converted",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: actorUserId || "system", email: "system" },
      entity: { type: "proposal", id: proposalId },
      metadata: { conversionId: conversion.id, type: conversionType }
    });

    return conversion;
  });
}
