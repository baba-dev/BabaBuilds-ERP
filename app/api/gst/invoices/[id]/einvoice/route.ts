import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { download, gstError, requireGstAccess } from "@/lib/gst/access";
import { invoiceGstSelect, loadGstProfile, toInvoiceInput } from "@/lib/gst/data";
import { classifyInvoice } from "@/lib/gst/classify";
import { buildEInvoicePayload } from "@/lib/gst/einvoice";

/** e-Invoice JSON (INV-01 v1.1) for upload to the IRP or the offline tool, which returns the IRN and signed QR. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const row = await prisma.invoice.findFirst({ where: { id, workspaceId: auth.access.workspaceId }, select: { ...invoiceGstSelect, client: { select: { country: true, taxId: true, gstStateCode: true, address: true, name: true } } } });
  if (!row) return gstError(404, "NOT_FOUND", "Invoice not found.");
  if (row.status === "VOID") return gstError(409, "VOID_INVOICE", "A cancelled invoice cannot be reported.");
  const profile = await loadGstProfile(auth.access.workspaceId);
  if (!profile.gstin || !profile.stateCode) return gstError(409, "GSTIN_REQUIRED", "Add your GSTIN and state in GST setup first.");
  const classified = classifyInvoice(toInvoiceInput(row), profile.stateCode);
  const { payload, problems } = buildEInvoicePayload({
    seller: { gstin: profile.gstin, legalName: profile.companyName, address: profile.address, stateCode: profile.stateCode },
    buyer: { gstin: classified.gstin, legalName: row.client?.name ?? row.clientName, address: row.client?.address ?? "", stateCode: row.client?.gstStateCode ?? (classified.gstin ? classified.gstin.slice(0, 2) : null) },
    invoice: classified,
  });
  if (new URL(request.url).searchParams.get("check") === "1") return NextResponse.json({ problems });
  return download(JSON.stringify([payload], null, 2), `einvoice_${classified.number.replace(/[^\w.-]+/g, "_")}.json`, "application/json");
}
