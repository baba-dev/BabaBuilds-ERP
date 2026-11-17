import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { logActivity } from "@/lib/security/activity-log";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { serializePublic } from "@/lib/proposals/serialize";
import { addProposalEvent, CLIENT_ACTIONABLE, findPublicProposal, isExpired, loadBusiness, scaleMilestones, totalsForSelection } from "@/lib/proposals/public";
import { proposalError } from "@/lib/proposals/access";
import { afterProposalChange } from "@/lib/proposals/save";

type Ctx = { params: Promise<{ token: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Public, whitelisted view of a proposal. Never returns raw rows (client tax IDs, IPs, internal notes...). */
export async function GET(request: Request, { params }: Ctx) {
  const { token } = await params;
  const ip = getClientIp(request);
  const limited = await checkRateLimit(`proposal-public-get:${ip}`, 120, 60_000);
  if (!limited.ok) return proposalError(429, "RATE_LIMITED", "Too many requests.");

  const row = await findPublicProposal(token);
  if (!row) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  const business = await loadBusiness(row.workspaceId);
  return NextResponse.json({ proposal: serializePublic(row, business) }, { headers: NO_STORE });
}

const acceptSchema = z.object({
  email: z.string().trim().min(1).max(200),
  selectedItemIds: z.array(z.string().max(64)).max(100).optional(),
  signerName: z.string().trim().max(120).optional(),
  signatureBase64: z
    .string()
    .max(300_000)
    .refine((v) => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Invalid signature image.")
    .nullish(),
});

export async function PATCH(request: Request, { params }: Ctx) {
  const { token } = await params;
  const ip = getClientIp(request);
  // Guessing the verification email must be expensive.
  const limited = await checkRateLimit(`proposal-accept:${token}:${ip}`, 8, 15 * 60_000);
  if (!limited.ok) return proposalError(429, "RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");

  const parsed = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return proposalError(400, "VALIDATION_ERROR", "Verification required.");
  const { email: identifier, selectedItemIds, signerName, signatureBase64 } = parsed.data;

  const proposal = await findPublicProposal(token);
  if (!proposal) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  if (proposal.status === "ACCEPTED" || proposal.status === "INVOICED") return proposalError(409, "ALREADY_ACCEPTED", "This proposal is already accepted.");
  if (!CLIENT_ACTIONABLE.includes(proposal.status)) return proposalError(409, "NOT_ACTIONABLE", "This proposal can no longer be accepted.");
  if (isExpired(proposal.status, proposal.validUntil)) {
    return proposalError(403, "PROPOSAL_EXPIRED", "This proposal has expired and can no longer be accepted. Please request a new quote.");
  }

  const full = await prisma.proposal.findUnique({ where: { id: proposal.id }, include: { client: { select: { name: true, email: true } } } });
  if (!full) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  const clientEmail = full.client.email?.toLowerCase().trim();
  const clientName = full.client.name?.toLowerCase().trim();
  const input = identifier.toLowerCase();
  if (clientEmail) {
    if (clientEmail !== input) return proposalError(403, "VERIFICATION_FAILED", "Identity verification failed. Use the email address this proposal was sent to.");
  } else if (clientName) {
    if (clientName !== input) return proposalError(403, "VERIFICATION_FAILED", "Please enter your exact company name to sign.");
  } else {
    return proposalError(403, "VERIFICATION_FAILED", "Verification failed. Client data missing.");
  }

  const selected = new Set(selectedItemIds ?? proposal.items.filter((i) => i.isSelected).map((i) => i.id));
  const totals = totalsForSelection(full, proposal.items, selected);
  const acceptedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.proposal.updateMany({
      where: { id: proposal.id, status: { in: CLIENT_ACTIONABLE } },
      data: {
        status: "ACCEPTED",
        acceptedAt,
        acceptedByName: signerName || full.client.name,
        clientIp: ip === "unknown" ? null : ip,
        subtotal: totals.subtotal,
        estimatedTax: totals.estimatedTax,
        totalAmount: totals.totalAmount,
        clientSignatureBase64: signatureBase64 || null,
      },
    });
    if (claim.count === 0) return false;

    const keep = new Set(totals.chosenIds);
    for (const item of proposal.items) {
      await tx.proposalItem.update({ where: { id: item.id }, data: { isSelected: keep.has(item.id) } });
    }
    if (!totals.totalAmount.equals(full.totalAmount) && proposal.billingMilestones.length) {
      const milestones = await tx.billingMilestone.findMany({ where: { proposalId: proposal.id }, orderBy: { createdAt: "asc" } });
      const amounts = scaleMilestones(milestones.map((m) => m.amount), full.totalAmount, totals.totalAmount);
      for (let i = 0; i < milestones.length; i += 1) {
        await tx.billingMilestone.update({ where: { id: milestones[i].id }, data: { amount: amounts[i] } });
      }
    }
    await addProposalEvent(tx, {
      workspaceId: proposal.workspaceId,
      proposalId: proposal.id,
      type: "ACCEPTED",
      message: signerName || full.client.name,
      metadata: { total: totals.totalAmount.toFixed(2), optionalDeclined: proposal.items.filter((i) => i.isOptional && !keep.has(i.id)).length },
    });
    return true;
  });
  if (!result) return proposalError(409, "NOT_ACTIONABLE", "This proposal just changed and can no longer be accepted.");

  await logActivity({
    action: "proposal_accepted",
    status: "SUCCESS",
    workspaceId: proposal.workspaceId,
    actor: { email: full.client.email || "Anonymous Client" },
    entity: { type: "proposal", id: proposal.id },
    ipAddress: ip === "unknown" ? null : ip,
    userAgent: request.headers.get("user-agent") || null,
    metadata: { acceptedByName: signerName || full.client.name, finalTotalAmount: totals.totalAmount.toFixed(2) },
  }).catch(() => null);
  dispatchNotification({
    event: "PROPOSAL_ACCEPTED",
    workspaceId: proposal.workspaceId,
    data: { proposalNo: proposal.proposalNo, clientName: full.client.name, amount: totals.totalAmount.toFixed(2) },
  }).catch(() => null);
  await afterProposalChange(proposal.workspaceId, "accepted");

  return NextResponse.json({ success: true, status: "ACCEPTED", totalAmount: totals.totalAmount.toFixed(2) });
}
