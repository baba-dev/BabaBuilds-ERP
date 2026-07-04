import type { Prisma, PrismaClient } from "@prisma/client";

const INVOICE_SEQUENCE_WIDTH = 3;
const PROPOSAL_SEQUENCE_WIDTH = 3;

type NumberingClient = Prisma.TransactionClient | PrismaClient;

export function getFinancialYear(date = new Date()) {
  const currentMonth = date.getMonth() + 1;
  const currentYear = date.getFullYear();
  const shortYear = currentYear.toString().slice(-2);

  return currentMonth <= 3
    ? `${parseInt(shortYear, 10) - 1}-${shortYear}`
    : `${shortYear}-${parseInt(shortYear, 10) + 1}`;
}

function parseTrailingSequence(value: string, separator: string, expectedParts: number) {
  const parts = value.split(separator);
  if (parts.length !== expectedParts) return null;

  const sequence = parseInt(parts[expectedParts - 1] || "", 10);
  return Number.isNaN(sequence) ? null : sequence;
}

export async function getNextInvoiceNumber(
  tx: NumberingClient,
  workspaceId: string,
  invoiceDate = new Date(),
) {
  const financialYear = getFinancialYear(invoiceDate);
  const prefix = `INV/${financialYear}/`;
  const recentInvoices = await tx.invoice.findMany({
    where: {
      workspaceId,
      financialYear,
      invoiceNumber: { startsWith: prefix },
    },
    select: { invoiceNumber: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const maxSequence = recentInvoices.reduce((max, invoice) => {
    const sequence = parseTrailingSequence(invoice.invoiceNumber, "/", 3);
    return sequence === null ? max : Math.max(max, sequence);
  }, 0);

  return {
    invoiceNumber: `${prefix}${(maxSequence + 1).toString().padStart(INVOICE_SEQUENCE_WIDTH, "0")}`,
    financialYear,
  };
}

export async function getNextProposalNo(
  tx: NumberingClient,
  workspaceId: string,
  proposalDate = new Date(),
) {
  const shortYear = proposalDate.getFullYear().toString().slice(-2);
  const prefix = `EST-${shortYear}-`;
  const recentProposals = await tx.proposal.findMany({
    where: {
      workspaceId,
      proposalNo: { startsWith: prefix },
    },
    select: { proposalNo: true },
    orderBy: { dateCreated: "desc" },
    take: 100,
  });

  const maxSequence = recentProposals.reduce((max, proposal) => {
    const sequence = parseTrailingSequence(proposal.proposalNo, "-", 3);
    return sequence === null ? max : Math.max(max, sequence);
  }, 0);

  return `${prefix}${(maxSequence + 1).toString().padStart(PROPOSAL_SEQUENCE_WIDTH, "0")}`;
}

export function isUniqueConstraintError(error: unknown) {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";
}
