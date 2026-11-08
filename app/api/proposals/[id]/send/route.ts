import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { buildProposalEmail } from "@/lib/notifications/transactional-email-templates";
import { logActivity } from "@/lib/security/activity-log";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { addProposalEvent } from "@/lib/proposals/events";
import { afterProposalChange, publicProposalUrl } from "@/lib/proposals/save";
import { isExpired } from "@/lib/proposals/status";
import { checkRateLimit } from "@/lib/rate-limit-memory";

const bodySchema = z.object({ message: z.string().trim().max(1000).optional() });

/** Emails the share link to the client. First send moves DRAFT -> SENT; later sends are reminders / updates. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProposalAccess("proposals.send");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;
  const { id } = await params;

  const limited = checkRateLimit(`proposal-send:${workspaceId}:${id}`, 5, 60 * 60 * 1000);
  if (!limited.ok) return proposalError(429, "RATE_LIMITED", "This proposal was emailed several times already. Try again later.");

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return proposalError(400, "VALIDATION_ERROR", "Message is too long.");

  const proposal = await prisma.proposal.findFirst({ where: { id, workspaceId }, include: { client: true } });
  if (!proposal) return proposalError(404, "PROPOSAL_NOT_FOUND", "Proposal not found.");
  if (["ACCEPTED", "INVOICED", "DECLINED"].includes(proposal.status)) {
    return proposalError(409, "INVALID_TRANSITION", "Only a draft or open proposal can be sent.");
  }
  if (isExpired(proposal.status, proposal.validUntil) || (proposal.status === "DRAFT" && proposal.validUntil < new Date(Date.now() - 86_400_000))) {
    return proposalError(409, "PROPOSAL_EXPIRED", "The validity date has passed. Edit the proposal and choose a new date first.");
  }
  const to = proposal.client.email?.trim();
  if (!to) return proposalError(422, "CLIENT_EMAIL_REQUIRED", `Add an email address to ${proposal.client.name} before sending.`);

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  if (!profile) return proposalError(422, "PROFILE_REQUIRED", "Complete your business profile before sending proposals.");

  const isFirst = proposal.status === "DRAFT" || !proposal.sentAt;
  const kind = isFirst ? (proposal.revision > 1 ? "update" : "send") : "reminder";
  const money = `${proposal.currency} ${proposal.totalAmount.toNumber().toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const template = buildProposalEmail({
    companyName: profile.companyName,
    clientName: proposal.client.name,
    proposalNo: proposal.proposalNo,
    title: proposal.title,
    totalFormatted: money,
    validUntilFormatted: proposal.validUntil.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    url: publicProposalUrl(proposal.publicToken),
    kind,
    message: body.data.message,
  });

  try {
    await sendEmail({ route: "user", profile, to, subject: template.subject, html: template.html, text: template.text });
  } catch (error) {
    console.error("Proposal email failed:", error);
    return proposalError(502, "EMAIL_FAILED", "The email could not be sent. Check your email settings and try again.");
  }

  const now = new Date();
  if (proposal.status === "DRAFT") {
    await prisma.proposal.updateMany({ where: { id, workspaceId, status: "DRAFT" }, data: { status: "SENT", sentAt: now, sentByUserId: userId } });
  } else {
    await prisma.proposal.updateMany({ where: { id, workspaceId }, data: { sentAt: proposal.sentAt ?? now } });
  }
  await addProposalEvent(prisma, {
    workspaceId,
    proposalId: id,
    type: kind === "reminder" ? "REMINDER_SENT" : "SENT",
    message: to,
    actorUserId: userId,
  });
  logActivity({ action: "proposal_sent", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "proposal", id }, request, metadata: { kind } });
  afterProposalChange(workspaceId, "send");
  return NextResponse.json({ success: true, status: proposal.status === "DRAFT" ? "SENT" : proposal.status, sentTo: to, kind });
}
