import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientError, requireClientAccess } from "@/lib/clients/access";

type Ctx = { params: Promise<{ id: string; noteId: string }> };

export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id, noteId } = await props.params;
  const parsed = z.object({ pinned: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return clientError(400, "INVALID_BODY", "Say whether to pin the note.");
  const res = await prisma.clientNote.updateMany({ where: { id: noteId, clientId: id, workspaceId: auth.ctx.workspaceId }, data: { pinned: parsed.data.pinned } });
  return res.count ? NextResponse.json({ success: true }) : clientError(404, "NOTE_NOT_FOUND", "Note not found");
}

export async function DELETE(_req: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id, noteId } = await props.params;
  const res = await prisma.clientNote.deleteMany({ where: { id: noteId, clientId: id, workspaceId: auth.ctx.workspaceId } });
  return res.count ? NextResponse.json({ success: true }) : clientError(404, "NOTE_NOT_FOUND", "Note not found");
}
