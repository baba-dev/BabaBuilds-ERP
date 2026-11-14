import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientError, requireClientAccess } from "@/lib/clients/access";

const body = z.object({ body: z.string().trim().min(1, "REQUIRED").max(4000, "TOO_LONG"), pinned: z.boolean().optional() });

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const notes = await prisma.clientNote.findMany({ where: { clientId: id, workspaceId: auth.ctx.workspaceId }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 200 });
  return NextResponse.json({ data: notes });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const client = await prisma.client.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId }, select: { id: true } });
  if (!client) return clientError(404, "CLIENT_NOT_FOUND", "Client not found");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write something first.", code: "VALIDATION", fields: [{ field: "body", code: parsed.error.issues[0]?.message ?? "REQUIRED" }] }, { status: 422 });
  const [note] = await prisma.$transaction([
    prisma.clientNote.create({ data: { workspaceId: auth.ctx.workspaceId, clientId: id, authorUserId: auth.ctx.userId, authorName: auth.ctx.name, body: parsed.data.body, pinned: !!parsed.data.pinned } }),
    prisma.client.update({ where: { id }, data: { lastContactedAt: new Date() } }),
  ]);
  return NextResponse.json({ success: true, note }, { status: 201 });
}
