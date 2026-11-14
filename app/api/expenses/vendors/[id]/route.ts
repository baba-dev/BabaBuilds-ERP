import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { normalizeVendor, vendorSchema } from "@/lib/expenses/vendors";
import { vendorKey } from "@/lib/expenses/vendor-key";
import { logActivity } from "@/lib/security/activity-log";

type Ctx = { params: Promise<{ id: string }> };

/** Edits the vendor's own record. Bills already booked keep the name and details they were entered with. */
export async function PATCH(request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const existing = await prisma.vendor.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId } });
  if (!existing) return expenseError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return expenseError(400, "INVALID_BODY", "Send the changes as JSON.");
  if (body.archived === true || body.archived === false) {
    await prisma.vendor.update({ where: { id }, data: { archivedAt: body.archived ? new Date() : null } });
    return NextResponse.json({ success: true });
  }
  const parsed = vendorSchema.safeParse({ ...existing, ...body });
  if (!parsed.success) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "name"), code: i.message === "REQUIRED" || i.message === "TOO_LONG" || i.message === "EMAIL" ? i.message : "INVALID" })) }, { status: 422 });
  const n = normalizeVendor(parsed.data);
  if (!n.ok) return NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields: n.fields }, { status: 422 });
  const key = vendorKey(n.data.name);
  if (key !== existing.nameKey) {
    const clash = await prisma.vendor.findUnique({ where: { workspaceId_nameKey: { workspaceId: auth.ctx.workspaceId, nameKey: key } } });
    if (clash && clash.id !== id) return expenseError(409, "VENDOR_EXISTS", `${clash.name} is already a vendor.`, { existing: { id: clash.id, name: clash.name } });
  }
  const vendor = await prisma.vendor.update({ where: { id }, data: { ...n.data, nameKey: key } });
  void logActivity({ action: "vendor_updated", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "vendor", id } });
  return NextResponse.json({ success: true, vendor });
}

/** A vendor with bills can only be archived (the bills keep their link); an unused one is removed. */
export async function DELETE(_request: Request, props: Ctx) {
  const auth = await requireExpenseAccess("expenses.delete");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const v = await prisma.vendor.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId }, include: { _count: { select: { expenses: true, recurring: true } } } });
  if (!v) return expenseError(404, "VENDOR_NOT_FOUND", "Vendor not found.");
  if (v._count.expenses + v._count.recurring > 0) return expenseError(409, "VENDOR_IN_USE", "This vendor has bills, so it can only be archived.");
  await prisma.vendor.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
