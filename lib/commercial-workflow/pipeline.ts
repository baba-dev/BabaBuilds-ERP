import { Proposal, Invoice, ProposalConversion, Retainer, ServiceOrder } from '@prisma/client';

export type PipelineStage = 
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'CONVERTED'
  | 'AWAITING_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'RECONCILED'
  | 'EXPIRED'
  | 'DECLINED';

export type StalledReason = 
  | 'SENT_UNTOUCHED' 
  | 'VIEWED_UNACCEPTED' 
  | 'ACCEPTED_UNCONVERTED' 
  | 'CONVERTED_UNPAID' 
  | null;

export type NextBestAction =
  | 'SEND_REMINDER'
  | 'FOLLOW_UP_VIEW'
  | 'CONVERT_TO_INVOICE'
  | 'CHASE_PAYMENT'
  | 'RECONCILE_PAYMENT'
  | 'NONE';

// Prisma's types extended
type ConversionWithArtifacts = ProposalConversion & {
  invoice?: Invoice | null;
  retainer?: Retainer | null;
  serviceOrder?: ServiceOrder | null;
};

export interface PipelineRow {
  proposal: Proposal;
  
  // Pipeline Semantics
  stage: PipelineStage;
  ageInStageDays: number;
  
  // Operational States
  stalledReason: StalledReason;
  isStalled: boolean;
  paymentState: 'UNPAID' | 'PARTIAL' | 'PAID' | 'NA';
  nextBestAction: NextBestAction;
  
  // Downstream linkages
  linkedArtifacts: ConversionWithArtifacts[];
  
  // Visual/Tracing
  traceabilityId: string; // e.g. "EST-001"
  clientName: string;
  totalValue: number;
}

export function evaluateProposalStallStatus(stage: PipelineStage, proposal: Proposal, linkedArtifacts: ConversionWithArtifacts[]): StalledReason {
  const now = new Date().getTime();
  const daysSince = (date?: Date | null) => date ? (now - date.getTime()) / (1000 * 60 * 60 * 24) : 0;

  if (stage === 'SENT' && daysSince(proposal.sentAt) > 3) return 'SENT_UNTOUCHED';
  if (stage === 'VIEWED' && daysSince(proposal.lastViewedAt) > 5) return 'VIEWED_UNACCEPTED';
  if (stage === 'ACCEPTED' && daysSince(proposal.acceptedAt) > 2) return 'ACCEPTED_UNCONVERTED';
  
  // For unpaid logic, check invoices directly from artifacts
  if (['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'CONVERTED'].includes(stage)) {
    const invoices = linkedArtifacts.map(a => a.invoice).filter(Boolean) as Invoice[];
    const hasUnpaidOver7Days = invoices.some(inv => 
      ['PENDING', 'PARTIALLY_PAID'].includes(String(inv.status)) && daysSince(inv.createdAt) > 7
    );
    if (hasUnpaidOver7Days) return 'CONVERTED_UNPAID';
  }

  return null;
}

function derivePaymentState(linkedArtifacts: ConversionWithArtifacts[]): 'UNPAID' | 'PARTIAL' | 'PAID' | 'NA' {
  const invoices = linkedArtifacts.map(a => a.invoice).filter(Boolean) as Invoice[];
  if (invoices.length === 0) return 'NA'; // e.g., only Retainers / Service Orders without invoice yet

  const hasPaid = invoices.some(i => String(i.status) === 'PAID');
  const hasUnpaid = invoices.some(i => ['PENDING', 'PARTIALLY_PAID', 'DRAFT'].includes(String(i.status)));

  if (hasPaid && hasUnpaid) return 'PARTIAL';
  if (hasPaid && !hasUnpaid) return 'PAID';
  return 'UNPAID';
}

function determineNextBestAction(stage: PipelineStage, isStalled: boolean): NextBestAction {
  if (isStalled) {
    if (stage === 'SENT') return 'SEND_REMINDER';
    if (stage === 'VIEWED') return 'FOLLOW_UP_VIEW';
    if (stage === 'ACCEPTED') return 'CONVERT_TO_INVOICE';
    if (['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'CONVERTED'].includes(stage)) return 'CHASE_PAYMENT';
  }
  
  if (stage === 'PAID') return 'RECONCILE_PAYMENT'; // If we assumed payment but no recon.
  if (stage === 'ACCEPTED') return 'CONVERT_TO_INVOICE';

  return 'NONE';
}

export function deriveCommercialPipelineStage(proposal: Proposal, linkedArtifacts: ConversionWithArtifacts[]): PipelineStage {
  const now = new Date();
  
  // 1. Expired state takes precedence over early funnel stages if it wasn't accepted
  if (proposal.validUntil < now && !proposal.acceptedAt && !proposal.firstConvertedAt) {
    return 'EXPIRED';
  }

  // 2. Declined definitively kills the pipeline
  if (proposal.declinedAt || String(proposal.status) === 'DECLINED') {
    return 'DECLINED';
  }

  // 3. Dig into Downstream Artifacts for advanced lifecycle
  if (proposal.firstConvertedAt && linkedArtifacts.length > 0) {
    const paymentState = derivePaymentState(linkedArtifacts);
    
    // Check reconciliation logic (BabaERP usually tracks isReconciled on receipts instead of invoices, 
    // but conceptually we can define this stage placeholder)
    // if (allInvoicesReconciled) return 'RECONCILED';

    if (paymentState === 'PAID') return 'PAID';
    if (paymentState === 'PARTIAL') return 'PARTIALLY_PAID';
    if (paymentState === 'UNPAID') return 'AWAITING_PAYMENT';
    
    return 'CONVERTED'; // Catchall for conversions that don't map neatly to invoice payments
  }

  // 4. Default Base Statuses mapped dynamically
  if (proposal.acceptedAt) return 'ACCEPTED';
  if (proposal.firstViewedAt) return 'VIEWED';
  if (proposal.sentAt) return 'SENT';

  return 'DRAFT';
}

export function getProposalPipelineRows(
  proposals: (Proposal & { client: { name: string }, conversions: ConversionWithArtifacts[] })[]
): PipelineRow[] {
  const now = new Date().getTime();

  return proposals.map(proposal => {
    const stage = deriveCommercialPipelineStage(proposal, proposal.conversions);
    
    // Determine the anchor timestamp for "age in stage"
    let stageAnchor = proposal.dateCreated;
    if (stage === 'SENT') stageAnchor = proposal.sentAt || stageAnchor;
    if (stage === 'VIEWED') stageAnchor = proposal.lastViewedAt || stageAnchor;
    if (stage === 'ACCEPTED') stageAnchor = proposal.acceptedAt || stageAnchor;
    if (['CONVERTED', 'AWAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID'].includes(stage)) {
      stageAnchor = proposal.firstConvertedAt || stageAnchor;
    }
    const ageInStageDays = Math.max(0, Math.floor((now - stageAnchor.getTime()) / (1000 * 60 * 60 * 24)));

    const stalledReason = evaluateProposalStallStatus(stage, proposal, proposal.conversions);
    const paymentState = derivePaymentState(proposal.conversions);

    return {
      proposal,
      stage,
      ageInStageDays,
      stalledReason,
      isStalled: stalledReason !== null,
      paymentState,
      nextBestAction: determineNextBestAction(stage, stalledReason !== null),
      linkedArtifacts: proposal.conversions,
      traceabilityId: proposal.proposalNo,
      clientName: proposal.client?.name || 'Unknown',
      totalValue: Number(proposal.totalAmount || 0)
    };
  });
}

export interface PipelineSummary {
  counts: Record<PipelineStage, number>;
  values: Record<PipelineStage, number>;
  totalPipelineValue: number;
  acceptedNotConvertedValue: number;
  convertedUnpaidValue: number;
  paidThisMonthValue: number;
  stalledCount: number;
  stalledValue: number;
  averageDaysToAccept: number | null;
  winRatePct: number;
}

export function getProposalPipelineSummary(rows: PipelineRow[]): PipelineSummary {
  const counts = {} as Record<PipelineStage, number>;
  const values = {} as Record<PipelineStage, number>;
  
  let stalledCount = 0;
  let stalledValue = 0;
  let acceptedNotConvertedValue = 0;
  let convertedUnpaidValue = 0;
  let paidThisMonthValue = 0;
  
  let totalAcceptanceDays = 0;
  let acceptancesCount = 0;
  let wonCount = 0;
  let finishedCount = 0; // Exclude drafts/sent/viewed for win rate calculation if needed, but standard is (Won / Total Closed)
  let totalClosedCount = 0;

  const nowMs = new Date().getTime();
  const thirtyDaysAgo = nowMs - (30 * 24 * 60 * 60 * 1000);

  rows.forEach(row => {
    // Basic aggregation
    counts[row.stage] = (counts[row.stage] || 0) + 1;
    values[row.stage] = (values[row.stage] || 0) + row.totalValue;

    if (row.isStalled) {
      stalledCount++;
      stalledValue += row.totalValue;
    }

    if (row.stage === 'ACCEPTED') {
      acceptedNotConvertedValue += row.totalValue;
    }

    if (['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'CONVERTED'].includes(row.stage)) {
      convertedUnpaidValue += row.totalValue;
    }

    if (['PAID', 'RECONCILED'].includes(row.stage)) {
      // Check if it was paid recently (using convertedAt as proxy if no strict invoice date)
      if (row.proposal.firstConvertedAt && row.proposal.firstConvertedAt.getTime() >= thirtyDaysAgo) {
        paidThisMonthValue += row.totalValue;
      }
    }

    if (row.proposal.acceptedAt && row.proposal.sentAt) {
      const days = (row.proposal.acceptedAt.getTime() - row.proposal.sentAt.getTime()) / (1000 * 60 * 60 * 24);
      totalAcceptanceDays += Math.max(0, days);
      acceptancesCount++;
    }

    // Win Rate logic (Declined vs Won)
    if (['DECLINED', 'EXPIRED'].includes(row.stage)) {
      totalClosedCount++;
    } else if (['ACCEPTED', 'CONVERTED', 'AWAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID', 'RECONCILED'].includes(row.stage)) {
      wonCount++;
      totalClosedCount++;
    }
  });

  const totalPipelineValue = rows.reduce((sum, row) => sum + row.totalValue, 0);

  return {
    counts,
    values,
    totalPipelineValue,
    acceptedNotConvertedValue,
    convertedUnpaidValue,
    paidThisMonthValue,
    stalledCount,
    stalledValue,
    averageDaysToAccept: acceptancesCount > 0 ? (totalAcceptanceDays / acceptancesCount) : null,
    winRatePct: totalClosedCount > 0 ? Math.round((wonCount / totalClosedCount) * 100) : 0,
  };
}
