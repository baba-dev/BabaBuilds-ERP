import { Proposal, Client, Invoice, Retainer } from '@prisma/client';
import { evaluateProposalStallStatus, StalledReason } from './metrics';

export type PipelineStage = 'DRAFT' | 'SENT' | 'VIEWED' | 'EXPIRED' | 'DECLINED' | 'ACCEPTED' | 'CONVERTED' | 'PARTIALLY_PAID' | 'PAID' | 'RECONCILED';
export type NextBestAction = 'NONE' | 'REVIEW_AND_SEND' | 'FOLLOW_UP_VIEWED' | 'CONVERT_TO_INVOICE' | 'CHASE_PAYMENT' | 'RENEW_PROPOSAL';

export interface PipelineRow {
  proposal: Proposal;
  client: Client;
  stage: PipelineStage;
  stalledReason: StalledReason;
  isStalled: boolean;
  nextBestAction: NextBestAction;
  ageInStageDays: number;
  traceabilityId: string;
}

export function derivePipelineStage(proposal: Proposal, invoices: Invoice[]): PipelineStage {
  const linkedInvoices = invoices.filter(i => i.sourceProposalId === proposal.id);
  
  // Reconciled/Paid logic
  if (proposal.firstConvertedAt && linkedInvoices.length > 0) {
    if (linkedInvoices.every(i => ['PAID', 'Paid'].includes(String(i.status)))) return 'RECONCILED'; // or 'PAID'
    if (linkedInvoices.some(i => ['PAID', 'PARTIALLY_PAID', 'Paid', 'Partially Paid'].includes(String(i.status)))) return 'PARTIALLY_PAID';
    return 'CONVERTED';
  }

  // Pre-conversion logic
  if (proposal.firstConvertedAt) return 'CONVERTED';
  if (proposal.status === 'DECLINED') return 'DECLINED';
  if (proposal.status === 'EXPIRED') return 'EXPIRED';
  if (proposal.acceptedAt) return 'ACCEPTED';
  if (proposal.firstViewedAt) return 'VIEWED';
  if (proposal.sentAt) return 'SENT';
  return 'DRAFT';
}

export function deriveNextBestAction(stage: PipelineStage, stalledReason: StalledReason): NextBestAction {
  if (stalledReason === 'CONVERTED_UNPAID') return 'CHASE_PAYMENT';
  if (stalledReason === 'ACCEPTED_UNCONVERTED') return 'CONVERT_TO_INVOICE';
  if (stalledReason === 'VIEWED_UNACCEPTED') return 'FOLLOW_UP_VIEWED';
  if (stalledReason === 'SENT_UNTOUCHED') return 'FOLLOW_UP_VIEWED';
  if (stage === 'EXPIRED') return 'RENEW_PROPOSAL';
  if (stage === 'DRAFT') return 'REVIEW_AND_SEND';
  return 'NONE';
}

export function getProposalPipelineRows(
  proposals: (Proposal & { client: Client })[],
  invoices: Invoice[]
): PipelineRow[] {
  const now = new Date().getTime();
  const getAgeInDays = (date: Date) => Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));

  return proposals.map(p => {
    const stage = derivePipelineStage(p, invoices);
    const stalledReason = evaluateProposalStallStatus(p, invoices);
    const nextBestAction = deriveNextBestAction(stage, stalledReason);
    
    // Determine age based on current stage
    let age = 0;
    if (stage === 'DRAFT') age = getAgeInDays(p.dateCreated);
    else if (stage === 'SENT') age = p.sentAt ? getAgeInDays(p.sentAt) : 0;
    else if (stage === 'VIEWED') age = p.lastViewedAt ? getAgeInDays(p.lastViewedAt) : 0;
    else if (stage === 'ACCEPTED') age = p.acceptedAt ? getAgeInDays(p.acceptedAt) : 0;
    else if (stage === 'CONVERTED') age = p.firstConvertedAt ? getAgeInDays(p.firstConvertedAt) : 0;

    return {
      proposal: p,
      client: p.client,
      stage,
      stalledReason,
      isStalled: stalledReason !== null,
      nextBestAction,
      ageInStageDays: age,
      traceabilityId: p.proposalNo
    };
  });
}
