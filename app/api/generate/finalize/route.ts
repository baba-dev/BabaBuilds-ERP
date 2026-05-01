import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { finalizeInvoiceGenerationDraft } from "@/lib/invoice/finalize-draft";

type SessionWithWorkspace = {
  workspaceId?: string;
  user?: {
    id?: string | null;
  };
};

export async function POST(request: Request) {
  const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = session.workspaceId;
  const actorUserId = session.user?.id ?? null;
  if (!actorUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { draftId?: string } | null;
  const draftId = typeof body?.draftId === "string" ? body.draftId.trim() : "";
  if (!draftId) {
    return NextResponse.json({ error: "draftId is required." }, { status: 400 });
  }

  const draft = await prisma.invoiceGenerationDraft.findFirst({
    where: { id: draftId, workspaceId, createdByUserId: actorUserId },
  });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  if (draft.status === "CONFIRMED" && draft.finalizedInvoiceId) {
    const existingInvoice = await prisma.invoice.findUnique({ where: { id: draft.finalizedInvoiceId } });
    if (existingInvoice) {
      return NextResponse.json({
        success: true,
        invoice: existingInvoice,
        status: existingInvoice.status,
        emailStatus: "Replayed from confirmed draft",
        paymentLinkStatus: {
          attempted: Boolean(draft.razorpayLinkId),
          created: Boolean(draft.razorpayLinkId),
          skipReason: draft.razorpayLinkId ? null : "NOT_ATTEMPTED",
        },
      });
    }
  }

  if (draft.status !== "PENDING") {
    return NextResponse.json({ error: "Draft is no longer available." }, { status: 409 });
  }

  if (draft.expiresAt <= new Date()) {
    await prisma.invoiceGenerationDraft.update({
      where: { id: draft.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Draft has expired. Please regenerate." }, { status: 410 });
  }

  try {
    const result = await finalizeInvoiceGenerationDraft({
      workspaceId,
      actorId: actorUserId,
      draftId,
      forceSendEmail: null,
    });
    return NextResponse.json(result.response, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize invoice draft." },
      { status: 400 },
    );
  }
}
