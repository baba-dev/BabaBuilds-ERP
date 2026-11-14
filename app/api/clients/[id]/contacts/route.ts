import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientError, requireClientAccess } from "@/lib/clients/access";
import { contactSchema } from "@/lib/clients/contacts";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const contacts = await prisma.clientContact.findMany({ where: { clientId: id, workspaceId: auth.ctx.workspaceId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  return NextResponse.json({ data: contacts });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const client = await prisma.client.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId }, select: { id: true } });
  if (!client) return clientError(404, "CLIENT_NOT_FOUND", "Client not found");
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "form"), code: i.message })) }, { status: 422 });
  const d = parsed.data;
  const count = await prisma.clientContact.count({ where: { clientId: id } });
  const contact = await prisma.$transaction(async (tx) => {
    // The first contact is the primary one; choosing another primary demotes the rest.
    const primary = d.isPrimary || count === 0;
    if (primary) await tx.clientContact.updateMany({ where: { clientId: id }, data: { isPrimary: false } });
    return tx.clientContact.create({ data: { workspaceId: auth.ctx.workspaceId, clientId: id, name: d.name, role: d.role, email: d.email, phone: d.phone, isPrimary: primary, receivesInvoices: d.receivesInvoices, receivesReminders: d.receivesReminders } });
  });
  return NextResponse.json({ success: true, contact }, { status: 201 });
}

