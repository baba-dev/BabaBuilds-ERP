import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { messageSchema } from "@/lib/ca/schemas";

/** Reply in a thread. A reply from someone other than the asker marks it answered; the asker replying reopens it. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCaAccess("ca.request");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return caError(400, "INVALID_BODY", "Write a message.");
  const { workspaceId, userId, name } = auth.access;
  const r = await prisma.caRequest.findFirst({ where: { id, workspaceId }, select: { id: true, status: true, createdByUserId: true } });
  if (!r) return caError(404, "NOT_FOUND", "Request not found.");
  if (r.status === "CLOSED") return caError(409, "CLOSED", "This request is closed. Reopen it to reply.");
  if (parsed.data.documentId) {
    const doc = await prisma.document.findFirst({ where: { id: parsed.data.documentId, workspaceId }, select: { id: true } });
    if (!doc) return caError(422, "DOCUMENT_NOT_FOUND", "That document is not in this workspace's vault.");
  }
  const role = await prisma.workspaceUser.findFirst({ where: { workspaceId, userId }, select: { businessRole: true } });
  await prisma.$transaction([
    prisma.caRequestMessage.create({ data: { requestId: id, workspaceId, authorUserId: userId, authorName: name, authorRole: role?.businessRole ?? null, body: parsed.data.body, documentId: parsed.data.documentId ?? null } }),
    prisma.caRequest.update({ where: { id }, data: { status: r.createdByUserId === userId ? "OPEN" : "ANSWERED" } }),
  ]);
  await auditCa(auth.access, "REQUEST_REPLIED", { type: "CaRequest", id }, { hasDocument: !!parsed.data.documentId }, request);
  return NextResponse.json({ ok: true }, { status: 201 });
}
