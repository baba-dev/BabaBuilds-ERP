import { prisma } from "@/lib/prisma";
import { apiError, requireInvoiceAccess } from "@/lib/invoices/auth";
import { buildListWhere, buildOrderBy, parseInvoiceListQuery } from "@/lib/invoices/query";
import { toListItem } from "@/lib/invoices/serialize";

const MAX_EXPORT_ROWS = 10_000;

/** Neutralises spreadsheet formula injection and quotes the cell. */
function csvCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  try {
    const auth = await requireInvoiceAccess("invoices.export");
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.access;

    const parsed = parseInvoiceListQuery(new URL(request.url).searchParams);
    if (!parsed.success) return apiError(400, "INVALID_QUERY", "Invalid filters.");
    const now = new Date();

    const rows = await prisma.invoice.findMany({
      where: buildListWhere(workspaceId, parsed.data, now),
      orderBy: buildOrderBy(parsed.data),
      take: MAX_EXPORT_ROWS,
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, clientId: true, clientName: true,
        currency: true, exchangeRate: true, grandTotal: true, totalAmount: true, baseGrandTotal: true,
        amountReceived: true, status: true, source: true, sourceProposalId: true, retainerId: true, providerGateway: true,
        providerPaymentLinkId: true, sentAt: true, lastReminderSentAt: true, createdAt: true, pdfPath: true,
      },
    });

    const header = ["Invoice no", "Invoice date", "Due date", "Client", "Currency", "Exchange rate", "Total", "Received", "Balance", "Total (base currency)", "Status", "Source"];
    const lines = [header.map(csvCell).join(",")];
    for (const row of rows) {
      const i = toListItem(row, now);
      lines.push(
        [
          i.invoiceNumber, i.invoiceDate.slice(0, 10), i.dueDate?.slice(0, 10) ?? "", i.clientName, i.currency,
          i.exchangeRate, i.grandTotal, i.amountReceived, i.balance, i.baseGrandTotal, i.displayStatus, i.source,
        ].map(csvCell).join(","),
      );
    }

    return new Response("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoices-${now.toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
        ...(rows.length === MAX_EXPORT_ROWS ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    console.error("Invoice export error:", error);
    return apiError(500, "EXPORT_FAILED", "Failed to export invoices.");
  }
}
