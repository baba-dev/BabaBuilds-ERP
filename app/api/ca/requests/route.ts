import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { parseAnyFy } from "@/lib/ca/fy";
import { dateOnly, requestSchema } from "@/lib/ca/schemas";

export async function GET(request: Request) {
  const auth = await requireCaAccess("ca.view");
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  const fy = sp.get("fy");
  if (fy && parseAnyFy(fy) === null) return caError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  const status = sp.get("status");
  const rows = await prisma.caRequest.findMany({
    where: { workspaceId: auth.access.workspaceId, ...(fy ? { fy } : {}), ...(status === "OPEN" || status === "ANSWERED" || status === "CLOSED" ? { status } : {}) },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { messages: true } } },
  });
  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id, fy: r.fy, kind: r.kind, title: r.title, status: r.status, itemKind: r.itemKind, periodKey: r.periodKey, linkType: r.linkType, linkId: r.linkId,
      dueDate: r.dueDate?.toISOString() ?? null, createdByName: r.createdByName, createdByUserId: r.createdByUserId, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      messageCount: r._count.messages,
      last: r.messages[0] ? { authorName: r.messages[0].authorName, body: r.messages[0].body.slice(0, 160), at: r.messages[0].createdAt.toISOString() } : null,
    })),
  });
}

/** A CA asks for a document or raises a query; the owner (or anyone with access) answers in the thread. */
export async function POST(request: Request) {
  const auth = await requireCaAccess("ca.request");
  if (!auth.ok) return auth.response;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return caError(400, "INVALID_BODY", parsed.error.issues[0]?.message ?? "Check the request.");
  const b = parsed.data;
  const { workspaceId, userId, name } = auth.access;
  const created = await prisma.caRequest.create({
    data: {
      workspaceId, fy: b.fy, kind: b.kind, title: b.title, itemKind: b.itemKind ?? null, periodKey: b.periodKey ?? null, linkType: b.linkType ?? null, linkId: b.linkId ?? null,
      dueDate: b.dueDate ? dateOnly(b.dueDate) : null, createdByUserId: userId, createdByName: name,
      messages: { create: { workspaceId, authorUserId: userId, authorName: name, body: b.body } },
    },
    select: { id: true },
  });
  await auditCa(auth.access, "REQUEST_CREATED", { type: "CaRequest", id: created.id }, { kind: b.kind, fy: b.fy, itemKind: b.itemKind ?? null }, request);
  return NextResponse.json({ id: created.id }, { status: 201 });
}
