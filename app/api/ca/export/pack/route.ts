import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { auditCa, caError, requireCaAccess } from "@/lib/ca/access";
import { getCaOverview } from "@/lib/ca/data";
import { invoiceFile, receiptFile, safeName } from "@/lib/ca/evidence";
import { calendarRegister, purchaseRegister, salesRegister, summaryRegister, tdsRegister } from "@/lib/ca/exports";
import { fyBounds, fyLabel, parseAnyFy } from "@/lib/ca/fy";
import { toCsv } from "@/lib/gst/access";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

const MAX_FILES = 12000;
const MAX_BYTES = 500 * 1024 * 1024;
const BATCH = 500;

/**
 * The year's evidence pack for the CA: registers, the compliance calendar, a summary, and every invoice PDF and receipt,
 * with an index saying which file belongs to which record (and which records have none). Needs ca.export, is rate limited
 * and audited. Files are checked once for size, then streamed into the archive.
 */
export async function GET(request: Request) {
  const limit = enforceRouteRateLimit({ request, route: "/api/ca/export/pack", scope: "ca-export-pack", max: 4, windowMs: 15 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireCaAccess("ca.export");
  if (!auth.ok) return auth.response;
  const start = parseAnyFy(new URL(request.url).searchParams.get("fy"));
  if (start === null) return caError(400, "INVALID_FY", "Use a financial year like 2026-27.");
  const { workspaceId, name } = auth.access;
  const { start: from, end: to } = fyBounds(start);
  const fy = fyLabel(start);

  try {
    const zip = new JSZip();
    const index: Array<Array<string | number | null>> = [["Record", "Reference", "Counterparty", "Date", "File in pack", "Status"]];
    let files = 0;
    let bytes = 0;

    const add = async (folder: string, name: string, fullPath: string | null) => {
      if (!fullPath) return "path not recognised";
      try {
        const stat = await fsPromises.stat(fullPath);
        if (files + 1 > MAX_FILES || bytes + stat.size > MAX_BYTES) return "skipped: pack size limit";
        zip.file(`evidence/${folder}/${name}`, fs.createReadStream(fullPath, { highWaterMark: 64 * 1024 }));
        files += 1;
        bytes += stat.size;
        return "included";
      } catch {
        return "file missing on disk";
      }
    };

    let invoiceCursor: string | undefined;
    for (;;) {
      const invoices = await prisma.invoice.findMany({ where: { workspaceId, status: { not: "VOID" }, invoiceDate: { gte: from, lte: to } }, orderBy: [{ invoiceDate: "asc" }, { id: "asc" }], take: BATCH, ...(invoiceCursor ? { cursor: { id: invoiceCursor }, skip: 1 } : {}), select: { id: true, invoiceNumber: true, clientName: true, invoiceDate: true, pdfPath: true } });
      if (invoices.length === 0) break;
      invoiceCursor = invoices.at(-1)?.id;
      for (const inv of invoices) {
        const file = `${safeName(inv.invoiceNumber)}_${safeName(inv.clientName)}.pdf`;
        const status = inv.pdfPath ? await add("invoices", file, invoiceFile(workspaceId, inv.pdfPath)) : "no PDF recorded";
        index.push(["Invoice", inv.invoiceNumber, inv.clientName, inv.invoiceDate.toISOString().slice(0, 10), status === "included" ? `evidence/invoices/${file}` : "", status]);
      }
    }
    let expenseCursor: string | undefined;
    for (;;) {
      const expenses = await prisma.expense.findMany({ where: { workspaceId, approvalStatus: "APPROVED", date: { gte: from, lte: to } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: BATCH, ...(expenseCursor ? { cursor: { id: expenseCursor }, skip: 1 } : {}), select: { id: true, vendor: true, vendorInvoiceNo: true, date: true, receiptUrl: true } });
      if (expenses.length === 0) break;
      expenseCursor = expenses.at(-1)?.id;
      for (const e of expenses) {
        const ext = e.receiptUrl ? path.extname(e.receiptUrl) || ".pdf" : "";
        const file = `${e.date.toISOString().slice(0, 10)}_${safeName(e.vendor)}_${e.id.slice(-6)}${ext}`;
        const status = e.receiptUrl ? await add("receipts", file, receiptFile(workspaceId, e.receiptUrl)) : "no receipt recorded";
        index.push(["Expense", e.vendorInvoiceNo ?? "", e.vendor, e.date.toISOString().slice(0, 10), status === "included" ? `evidence/receipts/${file}` : "", status]);
      }
    }

    const overview = await getCaOverview(workspaceId, start);
    const [sales, purchases, tds] = await Promise.all([salesRegister(workspaceId, start), purchaseRegister(workspaceId, start), tdsRegister(workspaceId, start)]);
    zip.file("README.txt", [`Evidence pack for FY ${fy}`, `Prepared by ${name} on ${new Date().toISOString().slice(0, 10)}`, "", "registers/    sales, purchases, TDS, compliance calendar and a summary (CSV, opens in Excel)", "evidence/     invoice PDFs and expense receipts", "index.csv     every invoice and expense, the file that backs it, or why there is none", "", "GST returns are exported from the GST workspace (Tools > Accountant bundle).", "Figures are from the books as of the date above; estimates are for planning, not advice."].join("\n"));
    zip.file("index.csv", toCsv(index));
    zip.file("registers/sales.csv", toCsv(sales));
    zip.file("registers/purchases.csv", toCsv(purchases));
    zip.file("registers/tds.csv", toCsv(tds));
    zip.file("registers/calendar.csv", toCsv(calendarRegister(overview)));
    zip.file("registers/summary.csv", toCsv(summaryRegister(overview)));

    await auditCa(auth.access, "EXPORT_PACK", { type: "Workspace", id: workspaceId }, { fy, files, bytes, records: index.length - 1 }, request);
    const stream = zip.generateNodeStream({ streamFiles: true, compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new NextResponse(Readable.toWeb(stream as unknown as Readable) as ReadableStream, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="CA_Evidence_FY${fy}.zip"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("CA pack export error:", error);
    return caError(500, "EXPORT_FAILED", "Failed to build the evidence pack.");
  }
}
