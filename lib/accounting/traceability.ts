import { prisma } from '@/lib/prisma';

export type TraceabilityMatrixRow = {
  requestId: string | null;
  jobId: string | null;
  accountingTransactionId: string;
  sourceTable: string;
  sourceId: string;
  sourceRef: string | null;
  eventType: string;
  statementBatchId: string | null;
  postedAt: string;
};

export async function buildTraceabilityMatrix(workspaceId: string): Promise<TraceabilityMatrixRow[]> {
  const transactions = await prisma.accountingTransaction.findMany({
    where: { workspaceId },
    orderBy: { postedAt: 'desc' },
    select: {
      id: true,
      requestId: true,
      jobId: true,
      sourceTable: true,
      sourceId: true,
      sourceRef: true,
      eventType: true,
      statementBatchId: true,
      postedAt: true,
    },
  });

  return transactions.map((transaction) => ({
    requestId: transaction.requestId,
    jobId: transaction.jobId,
    accountingTransactionId: transaction.id,
    sourceTable: transaction.sourceTable,
    sourceId: transaction.sourceId,
    sourceRef: transaction.sourceRef,
    eventType: transaction.eventType,
    statementBatchId: transaction.statementBatchId,
    postedAt: transaction.postedAt.toISOString(),
  }));
}
