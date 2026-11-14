import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expenseError, requireExpenseAccess } from "@/lib/expenses/access";
import { listVendors, normalizeVendor, vendorSchema } from "@/lib/expenses/vendors";
import { vendorKey } from "@/lib/expenses/vendor-key";
import { logActivity } from "@/lib/security/activity-log";

const vendorFieldError = (fields: Array<{ field: string; code: string }>) => NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields }, { status: 422 });

export async function GET(request: Request) {
  const auth = await requireExpenseAccess("expenses.view");
  if (!auth.ok) return auth.response;
  const sp = new URL(request.url).searchParams;
  return NextResponse.json({ data: await listVendors(auth.ctx.workspaceId, { q: sp.get("q") ?? undefined, includeArchived: sp.get("archived") === "1" }) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireExpenseAccess("expenses.create");
  if (!auth.ok) return auth.response;
  const parsed = vendorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return vendorFieldError(parsed.error.issues.map((i) => ({ field: String(i.path[0] ?? "name"), code: i.message === "REQUIRED" || i.message === "TOO_LONG" || i.message === "EMAIL" ? i.message : "INVALID" })));
  const n = normalizeVendor(parsed.data);
  if (!n.ok) return vendorFieldError(n.fields);
  const key = vendorKey(n.data.name);
  if (!key) return vendorFieldError([{ field: "name", code: "REQUIRED" }]);
  const exists = await prisma.vendor.findUnique({ where: { workspaceId_nameKey: { workspaceId: auth.ctx.workspaceId, nameKey: key } } });
  if (exists) return expenseError(409, "VENDOR_EXISTS", `${exists.name} is already a vendor.`, { existing: { id: exists.id, name: exists.name } });
  const vendor = await prisma.vendor.create({ data: { ...n.data, workspaceId: auth.ctx.workspaceId, nameKey: key } });
  void logActivity({ action: "vendor_created", status: "SUCCESS", workspaceId: auth.ctx.workspaceId, actor: { userId: auth.ctx.userId, email: auth.ctx.email ?? undefined }, entity: { type: "vendor", id: vendor.id } });
  return NextResponse.json({ success: true, vendor }, { status: 201 });
}
