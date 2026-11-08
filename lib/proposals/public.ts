import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { addProposalEvent } from "@/lib/proposals/events";
import { publicInclude } from "@/lib/proposals/serialize";
import { isExpired, OPEN_STATUSES } from "@/lib/proposals/status";

/** Statuses a client may act on through the share link. */
export const CLIENT_ACTIONABLE = [...OPEN_STATUSES] as string[];

export async function findPublicProposal(token: string) {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 64) return null;
  const row = await prisma.proposal.findUnique({ where: { publicToken: trimmed }, include: publicInclude });
  // Drafts and archived proposals do not exist as far as the client is concerned.
  if (!row || row.status === "DRAFT" || row.archivedAt) return null;
  return row;
}

export async function loadBusiness(workspaceId: string) {
  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    select: { companyName: true, logoUrl: true, taxLabel: true },
  });
  return { name: profile?.companyName || "Your service provider", logoUrl: profile?.logoUrl ?? null, taxLabel: profile?.taxLabel || "Tax" };
}

export { isExpired };

type Line = { id: string; total: Prisma.Decimal; isOptional: boolean };

/**
 * Totals for the lines the client kept. Taking every line leaves the quoted totals untouched (no rounding drift);
 * otherwise tax is re-derived from the stored rate so it matches what invoicing will charge.
 */
export function totalsForSelection(
  stored: { subtotal: Prisma.Decimal; estimatedTax: Prisma.Decimal; totalAmount: Prisma.Decimal; taxRatePercent: number },
  lines: Line[],
  selectedIds: Set<string>,
) {
  const chosen = lines.filter((l) => !l.isOptional || selectedIds.has(l.id));
  if (chosen.length === lines.length) return { subtotal: stored.subtotal, estimatedTax: stored.estimatedTax, totalAmount: stored.totalAmount, chosenIds: chosen.map((c) => c.id) };
  const subtotal = chosen.reduce((acc, l) => acc.plus(l.total), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const estimatedTax = subtotal.mul(toDecimal(stored.taxRatePercent)).div(100).toDecimalPlaces(2);
  return { subtotal, estimatedTax, totalAmount: subtotal.plus(estimatedTax), chosenIds: chosen.map((c) => c.id) };
}

/** Spread the new total over milestones proportionally; the last one absorbs the rounding difference. */
export function scaleMilestones(amounts: Prisma.Decimal[], oldTotal: Prisma.Decimal, newTotal: Prisma.Decimal): Prisma.Decimal[] {
  if (amounts.length === 0 || oldTotal.isZero()) return amounts;
  const ratio = newTotal.div(oldTotal);
  let allocated = new Prisma.Decimal(0);
  return amounts.map((amount, i) => {
    if (i === amounts.length - 1) return newTotal.minus(allocated).toDecimalPlaces(2);
    const next = amount.mul(ratio).toDecimalPlaces(2);
    allocated = allocated.plus(next);
    return next;
  });
}

export { addProposalEvent };
