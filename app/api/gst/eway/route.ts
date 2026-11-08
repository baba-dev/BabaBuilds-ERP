import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditGst, download, gstError, requireGstAccess } from "@/lib/gst/access";
import { invoiceGstSelect, loadGstProfile, toInvoiceInput } from "@/lib/gst/data";
import { classifyInvoice } from "@/lib/gst/classify";
import { buildEwayBulkJson, needsEway, validateTransport } from "@/lib/gst/eway";

const schema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1).max(50),
  transport: z.object({
    mode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
    distanceKm: z.number().int().min(1).max(4000),
    vehicleNo: z.string().trim().max(15),
    transporterId: z.string().trim().max(15).optional(),
    fromPin: z.string().regex(/^\d{6}$/),
    toPin: z.string().regex(/^\d{6}$/),
  }),
});

/** Bulk-upload JSON for the e-way bill portal (goods lines only), with one transport block applied to the selected invoices. */
export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", "Check the transport details and PIN codes.");
  const problems = validateTransport(body.data.transport);
  if (problems.length) return gstError(400, "INVALID_TRANSPORT", "Check the vehicle number, PIN codes and distance.", { problems });
  const profile = await loadGstProfile(auth.access.workspaceId);
  if (!profile.gstin || !profile.stateCode) return gstError(409, "GSTIN_REQUIRED", "Add your GSTIN and state in GST setup first.");
  const rows = await prisma.invoice.findMany({ where: { id: { in: body.data.invoiceIds }, workspaceId: auth.access.workspaceId, status: { not: "VOID" } }, select: invoiceGstSelect });
  const eligible = rows.map((r) => classifyInvoice(toInvoiceInput(r), profile.stateCode)).filter(needsEway);
  if (eligible.length === 0) return gstError(409, "NOTHING_ELIGIBLE", "None of the selected invoices need an e-way bill (goods above ₹50,000).");
  const json = buildEwayBulkJson({
    userGstin: profile.gstin,
    seller: { gstin: profile.gstin, stateCode: profile.stateCode },
    invoices: eligible.map((invoice) => ({ invoice, buyer: { gstin: invoice.gstin, stateCode: invoice.placeOfSupply === "96" ? "96" : invoice.placeOfSupply }, transport: { ...body.data.transport, mode: body.data.transport.mode } })),
  });
  await auditGst(auth.access, "EWAY_JSON_EXPORTED", { type: "Invoice" }, { count: eligible.length }, request);
  return download(JSON.stringify(json, null, 2), `eway_bulk_${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}
