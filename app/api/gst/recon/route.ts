import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditGst, gstError, requireGstAccess } from "@/lib/gst/access";
import { getRecon } from "@/lib/gst/service";
import { parseGstr2bCsv, parseGstr2bJson } from "@/lib/gst/recon";
import { normalizeGstin } from "@/lib/gst/gstin";

const MAX_BYTES = 8 * 1024 * 1024;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  const auth = await requireGstAccess("tax.view");
  if (!auth.ok) return auth.response;
  const period = new URL(request.url).searchParams.get("period") ?? "";
  if (!MONTH.test(period)) return gstError(400, "INVALID_PERIOD", "GSTR-2B is monthly. Use a period like 2026-04.");
  const tol = Number(new URL(request.url).searchParams.get("tolerance"));
  const result = await getRecon(auth.access.workspaceId, period, Number.isFinite(tol) && tol >= 0 && tol <= 100 ? tol : undefined);
  return NextResponse.json(result ?? { rows: [], counts: {}, unmatchedTax: 0, uploaded: 0 });
}

/** Upload a GSTR-2B (portal JSON or a CSV) for a month; replaces that month's earlier upload. */
export async function POST(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const periodField = String(form?.get("period") ?? "");
  if (!(file instanceof File) || file.size === 0) return gstError(400, "FILE_REQUIRED", "Choose a GSTR-2B file to upload.");
  if (file.size > MAX_BYTES) return gstError(413, "FILE_TOO_LARGE", "The file is larger than 8 MB.");
  const text = await file.text();
  let parsed;
  try {
    parsed = file.name.toLowerCase().endsWith(".csv") ? parseGstr2bCsv(text) : parseGstr2bJson(JSON.parse(text));
  } catch {
    return gstError(400, "UNREADABLE_FILE", "We could not read that file. Upload the JSON downloaded from the GST portal or a CSV in the template format.");
  }
  const period = MONTH.test(periodField) ? periodField : parsed.periodHint;
  if (!period || !MONTH.test(period)) return gstError(400, "INVALID_PERIOD", "Choose which month this GSTR-2B is for.");
  if (parsed.rows.length === 0) return gstError(400, "NO_ROWS", "No supplier invoices were found in that file.");
  const workspaceId = auth.access.workspaceId;
  const unique = new Map<string, (typeof parsed.rows)[number]>();
  for (const r of parsed.rows) unique.set(`${normalizeGstin(r.supplierGstin)}|${r.invoiceNumber}`, r);
  await prisma.$transaction([
    prisma.gstr2bEntry.deleteMany({ where: { workspaceId, periodKey: period } }),
    prisma.gstr2bEntry.createMany({
      data: Array.from(unique.values()).map((r) => ({
        workspaceId, periodKey: period, supplierGstin: normalizeGstin(r.supplierGstin), supplierName: r.supplierName, invoiceNumber: r.invoiceNumber, invoiceDate: r.invoiceDate,
        taxableValue: r.taxableValue, igst: r.igst, cgst: r.cgst, sgst: r.sgst, cess: r.cess, itcAvailable: r.itcAvailable, reverseCharge: r.reverseCharge,
      })),
    }),
  ]);
  await auditGst(auth.access, "GSTR2B_UPLOADED", { type: "Gstr2b", id: period }, { rows: unique.size }, request);
  return NextResponse.json({ period, imported: unique.size, skipped: parsed.skipped });
}

export async function DELETE(request: Request) {
  const auth = await requireGstAccess("tax.manage");
  if (!auth.ok) return auth.response;
  const period = new URL(request.url).searchParams.get("period") ?? "";
  if (!MONTH.test(period)) return gstError(400, "INVALID_PERIOD", "Use a period like 2026-04.");
  await prisma.gstr2bEntry.deleteMany({ where: { workspaceId: auth.access.workspaceId, periodKey: period } });
  await auditGst(auth.access, "GSTR2B_CLEARED", { type: "Gstr2b", id: period }, undefined, request);
  return NextResponse.json({ ok: true });
}
