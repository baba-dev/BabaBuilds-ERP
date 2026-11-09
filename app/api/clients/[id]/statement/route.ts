import { prisma } from "@/lib/prisma";
import { clientError, requireClientAccess } from "@/lib/clients/access";
import { download, toCsv } from "@/lib/gst/access";

/** A client's account statement: invoices and the payments against them, with a running balance. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  const { id } = await props.params;
  const client = await prisma.client.findFirst({ where: { id, workspaceId: auth.ctx.workspaceId }, select: { name: true } });
  if (!client) return clientError(404, "CLIENT_NOT_FOUND", "Client not found");
  const invoices = await prisma.invoice.findMany({ where: { clientId: id, workspaceId: auth.ctx.workspaceId, voidedAt: null }, orderBy: { invoiceDate: "asc" }, take: 5000, select: { invoiceNumber: true, invoiceDate: true, currency: true, grandTotal: true, payments: { where: { reversedAt: null }, select: { amount: true, receivedAt: true, method: true, reference: true } } } });
  type Line = { at: Date; ref: string; kind: string; debit: number; credit: number; currency: string };
  const lines: Line[] = [];
  for (const i of invoices) {
    lines.push({ at: i.invoiceDate, ref: i.invoiceNumber, kind: "Invoice", debit: Number(i.grandTotal), credit: 0, currency: i.currency });
    for (const p of i.payments) lines.push({ at: p.receivedAt, ref: `${i.invoiceNumber}${p.reference ? ` / ${p.reference}` : ""}`, kind: `Payment (${p.method})`, debit: 0, credit: Number(p.amount), currency: i.currency });
  }
  lines.sort((a, b) => a.at.getTime() - b.at.getTime());
  let balance = 0;
  const rows = lines.map((l) => { balance += l.debit - l.credit; return [l.at.toISOString().slice(0, 10), l.kind, l.ref, l.currency, l.debit || "", l.credit || "", Math.round(balance * 100) / 100]; });
  const safe = client.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "client";
  return download(toCsv([["Date", "Type", "Reference", "Currency", "Billed", "Received", "Balance"], ...rows]), `statement-${safe}.csv`, "text/csv");
}

export const dynamic = "force-dynamic";
