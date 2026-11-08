import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES, startOfUtcDay } from "@/lib/proposals/status";
import type { ProposalSummaryDto } from "@/lib/proposals/types";

const DAY_MS = 86_400_000;
export const SUMMARY_WINDOW_DAYS = 180;

const toBase = (amount: Prisma.Decimal, rate: Prisma.Decimal) => amount.mul(rate.isZero() ? 1 : rate);

/** One definition of the pipeline numbers, shared by /proposals and (later) the dashboard. */
export async function getProposalSummary(workspaceId: string, now = new Date()): Promise<ProposalSummaryDto> {
  const today = new Date(startOfUtcDay(now));
  const soon = new Date(today.getTime() + 7 * DAY_MS);
  const windowStart = new Date(now.getTime() - SUMMARY_WINDOW_DAYS * DAY_MS);
  const open = [...OPEN_STATUSES];
  const live = { workspaceId, archivedAt: null } as const;

  const [workspace, openRows, readyRows, expiringSoonCount, draftCount, won, lost, expired, accepted] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { baseCurrency: true } }),
    prisma.proposal.findMany({ where: { ...live, status: { in: open }, validUntil: { gte: today } }, select: { totalAmount: true, exchangeRate: true } }),
    prisma.proposal.findMany({ where: { ...live, status: "ACCEPTED" }, select: { totalAmount: true, exchangeRate: true } }),
    prisma.proposal.count({ where: { ...live, status: { in: open }, validUntil: { gte: today, lt: soon } } }),
    prisma.proposal.count({ where: { ...live, status: "DRAFT" } }),
    prisma.proposal.count({ where: { ...live, status: { in: ["ACCEPTED", "INVOICED"] }, acceptedAt: { gte: windowStart } } }),
    prisma.proposal.count({ where: { ...live, status: "DECLINED", declinedAt: { gte: windowStart } } }),
    prisma.proposal.count({ where: { ...live, status: { in: open }, validUntil: { lt: today, gte: windowStart } } }),
    prisma.proposal.findMany({
      where: { ...live, status: { in: ["ACCEPTED", "INVOICED"] }, acceptedAt: { gte: windowStart }, sentAt: { not: null } },
      select: { acceptedAt: true, sentAt: true },
      take: 500,
    }),
  ]);

  const sum = (rows: Array<{ totalAmount: Prisma.Decimal; exchangeRate: Prisma.Decimal }>) =>
    rows.reduce((acc, r) => acc.plus(toBase(r.totalAmount, r.exchangeRate)), new Prisma.Decimal(0));

  const decided = won + lost + expired;
  const days = accepted
    .map((r) => (r.acceptedAt && r.sentAt ? (r.acceptedAt.getTime() - r.sentAt.getTime()) / DAY_MS : null))
    .filter((d): d is number => d !== null && d >= 0);

  return {
    baseCurrency: workspace?.baseCurrency || "INR",
    openValue: sum(openRows).toFixed(2),
    openCount: openRows.length,
    readyToInvoiceValue: sum(readyRows).toFixed(2),
    readyToInvoiceCount: readyRows.length,
    expiringSoonCount,
    draftCount,
    winRate: decided > 0 ? Math.round((won / decided) * 100) : null,
    avgDaysToAccept: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    windowDays: SUMMARY_WINDOW_DAYS,
  };
}
