import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientError, requireClientAccess } from "@/lib/clients/access";
import { contactPatchSchema } from "@/lib/clients/contacts";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id, contactId } = await props.params;
  const existing = await prisma.clientContact.findFirst({ where: { id: contactId, clientId: id, workspaceId: auth.ctx.workspaceId } });
  if (!existing) return clientError(404, "CONTACT_NOT_FOUND", "Contact not found");
  const raw = await request.json().catch(() => null);
  const parsed = contactPatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "form"), code: i.message })) }, { status: 422 });
  // Only fields that were sent change (the schema fills defaults for the rest).
  const sent = Object.keys(raw ?? {});
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => sent.includes(k)));
  const contact = await prisma.$transaction(async (tx) => {
    if (data.isPrimary === true) await tx.clientContact.updateMany({ where: { clientId: id }, data: { isPrimary: false } });
    return tx.clientContact.update({ where: { id: contactId }, data });
  });
  return NextResponse.json({ success: true, contact });
}

export async function DELETE(_req: Request, props: Ctx) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id, contactId } = await props.params;
  const res = await prisma.clientContact.deleteMany({ where: { id: contactId, clientId: id, workspaceId: auth.ctx.workspaceId } });
  if (res.count === 0) return clientError(404, "CONTACT_NOT_FOUND", "Contact not found");
  // If the primary contact was removed, the oldest remaining one takes over.
  const remaining = await prisma.clientContact.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" } });
  if (remaining.length && !remaining.some((c) => c.isPrimary)) await prisma.clientContact.update({ where: { id: remaining[0].id }, data: { isPrimary: true } });
  return NextResponse.json({ success: true });
}
