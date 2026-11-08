import { prisma } from "@/lib/prisma";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { buildListWhere, buildOrderBy, parseRetainerListQuery } from "@/lib/retainers/query";
import { listInclude, serializeListItem } from "@/lib/retainers/serialize";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { toDecimal } from "@/lib/money";

const MAX_ROWS = 10_000;

/** Neutralises spreadsheet formula injection and quotes the cell. */
function cell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const csv = (lines: string[][]) => "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n");

/**
 * CSV export. `scope=list` (default) exports the retainers matching the current filters; `scope=invoices` exports every
 * invoice the matching retainers generated (or one retainer's with `retainer=<id>`).
 */
export async function GET(request: Request) {
  const auth = await requireRetainerAccess("retainers.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.access;
  const url = new URL(request.url);
  const parsed = parseRetainerListQuery(url.searchParams);
  if (!parsed.success) return retainerError(400, "INVALID_QUERY", "Invalid filters.");
  const now = new Date();
  const scope = url.searchParams.get("scope") === "invoices" ? "invoices" : "list";
  const single = url.searchParams.get("retainer");
  try {
    let body: string;
    let name: string;
    if (scope === "list") {
      const rows = await prisma.retainer.findMany({ where: buildListWhere(workspaceId, parsed.data, now), include: listInclude, orderBy: buildOrderBy(parsed.data), take: MAX_ROWS });
      const head = ["Name", "Client", "Status", "Frequency", "Currency", "Per cycle (incl. tax)", "Monthly equivalent", "Next billing", "Ends", "Invoices issued", "Cycle limit", "Last billed", "Last error"];
      body = csv([head, ...rows.map((r) => { const i = serializeListItem(r, now); return [i.name, i.clientName, i.displayStatus, i.frequency, i.currency, i.total, i.monthlyTotal, i.nextBillingDate.slice(0, 10), i.endDate?.slice(0, 10) ?? "", String(i.cyclesBilled), i.maxCycles ? String(i.maxCycles) : "", i.lastBilledAt?.slice(0, 10) ?? "", i.lastError ?? ""]; })]);
      name = "retainers";
    } else {
      const where = single ? { workspaceId, retainerId: single } : { workspaceId, retainer: { is: buildListWhere(workspaceId, parsed.data, now) } };
      const invoices = await prisma.invoice.findMany({
        where, orderBy: { invoiceDate: "desc" }, take: MAX_ROWS,
        select: { invoiceNumber: true, invoiceDate: true, dueDate: true, status: true, currency: true, grandTotal: true, totalAmount: true, amountReceived: true, clientName: true, retainer: { select: { name: true } } },
      });
      const head = ["Invoice", "Retainer", "Client", "Date", "Due", "Status", "Currency", "Total", "Received", "Balance"];
      body = csv([head, ...invoices.map((i) => { const total = effectiveTotal(i); const received = toDecimal(i.amountReceived ?? 0); const open = i.status === "PENDING" || i.status === "PARTIALLY_PAID"; return [i.invoiceNumber, i.retainer?.name ?? "", i.clientName, i.invoiceDate.toISOString().slice(0, 10), i.dueDate?.toISOString().slice(0, 10) ?? "", i.status, i.currency, total.toFixed(2), received.toFixed(2), (open ? total.minus(received) : toDecimal(0)).toFixed(2)]; })]);
      name = "retainer-invoices";
    }
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-${now.toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Retainer export error:", error);
    return retainerError(500, "EXPORT_FAILED", "Failed to export.");
  }
}
