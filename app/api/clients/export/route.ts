import { prisma } from "@/lib/prisma";
import { requireClientAccess } from "@/lib/clients/access";
import { clientMetrics } from "@/lib/clients/queries";
import { download, toCsv } from "@/lib/gst/access";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";

/** The whole client book as a spreadsheet, with what each client owes. Needs clients.view, rate limited, and recorded. */
export async function GET(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/clients/export", scope: "client-export", max: 6, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.ctx;
  const includeArchived = new URL(request.url).searchParams.get("archived") === "1";
  const [clients, metrics] = await Promise.all([
    prisma.client.findMany({ where: { workspaceId, isWalkIn: false, ...(includeArchived ? {} : { archivedAt: null }) }, orderBy: { name: "asc" }, take: 20000 }),
    clientMetrics(workspaceId, null),
  ]);
  const head = ["Name", "Status", "Country", "Tax ID", "GST state", "Email", "Phone", "Website", "Industry", "Currency", "Payment terms (days)", "Credit limit", "Tags", "Billed", "Paid", "Outstanding", "Overdue", "Invoices", "Last invoice", "Created", "Archived"];
  const rows = clients.map((c) => { const m = metrics.get(c.id); return [c.name, c.status, c.country, c.taxId, c.gstStateCode, c.email, c.phone, c.website, c.industry, c.currency, c.paymentTermsDays, c.creditLimit === null ? "" : Number(c.creditLimit), c.tags.replace(/^\||\|$/g, "").replace(/\|/g, "; "), m?.billed ?? 0, m?.paid ?? 0, m?.outstanding ?? 0, m?.overdue ?? 0, m?.invoiceCount ?? 0, m?.lastInvoiceAt?.slice(0, 10) ?? "", c.createdAt.toISOString().slice(0, 10), c.archivedAt ? "yes" : ""]; });
  void logActivity({ action: "client_export", status: "SUCCESS", workspaceId, actor: { userId: auth.ctx.userId ?? undefined, email: auth.ctx.email ?? undefined }, entity: { type: "client", id: null }, metadata: { rows: rows.length }, request }).catch(() => null);
  return download(toCsv([head, ...rows]), `clients-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
}
