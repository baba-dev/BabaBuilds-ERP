import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { requestPatchSchema } from "@/lib/ca/schemas";
import { checkPermissionsSilent } from "@/lib/rbac";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCaAccess("ca.view");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const r = await prisma.caRequest.findFirst({ where: { id, workspaceId: auth.access.workspaceId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!r) return caError(404, "NOT_FOUND", "Request not found.");
  const docIds = r.messages.map((m) => m.documentId).filter((d): d is string => !!d);
  const docs = docIds.length ? await prisma.document.findMany({ where: { workspaceId: auth.access.workspaceId, id: { in: docIds } }, select: { id: true, title: true } }) : [];
  const titleById = new Map(docs.map((d) => [d.id, d.title]));
  return NextResponse.json({
    request: {
      id: r.id, fy: r.fy, kind: r.kind, title: r.title, status: r.status, itemKind: r.itemKind, periodKey: r.periodKey, linkType: r.linkType, linkId: r.linkId,
      dueDate: r.dueDate?.toISOString() ?? null, createdByName: r.createdByName, createdByUserId: r.createdByUserId, createdAt: r.createdAt.toISOString(),
    },
    messages: r.messages.map((m) => ({ id: m.id, authorUserId: m.authorUserId, authorName: m.authorName, body: m.body, at: m.createdAt.toISOString(), document: m.documentId ? { id: m.documentId, title: titleById.get(m.documentId) ?? "Document" } : null })),
  });
}

/** Close or reopen. The person who raised it, or anyone who manages compliance, may do so. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireCaAccess("ca.request");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = requestPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return caError(400, "INVALID_BODY", "Choose OPEN or CLOSED.");
  const { workspaceId, userId } = auth.access;
  const r = await prisma.caRequest.findFirst({ where: { id, workspaceId }, select: { id: true, createdByUserId: true } });
  if (!r) return caError(404, "NOT_FOUND", "Request not found.");
  const grants = await checkPermissionsSilent(userId, workspaceId, ["ca.manage"] as const);
  if (r.createdByUserId !== userId && !grants["ca.manage"]) return caError(403, "NOT_ALLOWED", "Only the person who raised this, or a compliance manager, can close it.");
  await prisma.caRequest.update({ where: { id }, data: { status: parsed.data.status, closedAt: parsed.data.status === "CLOSED" ? new Date() : null } });
  await auditCa(auth.access, parsed.data.status === "CLOSED" ? "REQUEST_CLOSED" : "REQUEST_REOPENED", { type: "CaRequest", id }, undefined, request);
  return NextResponse.json({ ok: true });
}
