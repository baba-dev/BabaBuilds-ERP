import { Proposal, Invoice } from '@prisma/client';

export type StalledReason = 'SENT_UNTOUCHED' | 'VIEWED_UNACCEPTED' | 'ACCEPTED_UNCONVERTED' | 'CONVERTED_UNPAID' | null;

export interface AugmentedProposal extends Proposal {
  stalledReason: StalledReason;
  isStalled: boolean;
}

export function evaluateProposalStallStatus(proposal: Proposal, invoices: Invoice[] = []): StalledReason {
  const now = new Date().getTime();
  const daysSince = (date: Date) => (now - date.getTime()) / (1000 * 60 * 60 * 24);

  // 1. Sent > 7 days untouched (status == SENT, no views)
  if (proposal.status === 'SENT' && proposal.sentAt && !proposal.firstViewedAt) {
    if (daysSince(proposal.sentAt) > 7) return 'SENT_UNTOUCHED';
  }

  // 2. Viewed > 3 days unaccepted
  if (proposal.status === 'VIEWED' && proposal.lastViewedAt && !proposal.acceptedAt) {
    if (daysSince(proposal.lastViewedAt) > 3) return 'VIEWED_UNACCEPTED';
  }

  // 3. Accepted > 3 days unconverted
  if (proposal.status === 'ACCEPTED' && proposal.acceptedAt && !proposal.firstConvertedAt) {
    if (daysSince(proposal.acceptedAt) > 3) return 'ACCEPTED_UNCONVERTED';
  }

  // 4. Converted > 15 days unpaid
  // We need to check if it's converted to an invoice but unpaid
  if (proposal.firstConvertedAt) {
    const linkedInvoices = invoices.filter(i => i.sourceProposalId === proposal.id);
    const hasUnpaidInvoiceOver15Days = linkedInvoices.some(inv => 
      ['PENDING', 'PARTIALLY_PAID'].includes(String(inv.status)) &&
      daysSince(inv.createdAt) > 15
    );
    if (hasUnpaidInvoiceOver15Days) return 'CONVERTED_UNPAID';
  }

  return null;
}

export function augmentProposalsWithStallStatus(proposals: Proposal[], invoices: Invoice[] = []): AugmentedProposal[] {
  return proposals.map(p => {
    const stalledReason = evaluateProposalStallStatus(p, invoices);
    return {
      ...p,
      stalledReason,
      isStalled: stalledReason !== null
    };
  });
}
