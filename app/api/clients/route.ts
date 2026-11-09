import { NextResponse } from "next/server";
import { requireClientAccess, clientError } from "@/lib/clients/access";
import { readClientBody, serviceError, storeClientLogo, validationError, removeStoredLogo } from "@/lib/clients/http";
import { clientBookSummary, listClients, listTags, clientMetrics } from "@/lib/clients/queries";
import { normalizeClientInput } from "@/lib/clients/schema";
import { createClient } from "@/lib/clients/service";
import { creditStatus } from "@/lib/clients/metrics";
import { prisma } from "@/lib/prisma";

const int = (v: string | null): number | null | typeof Number.NaN => {
  if (v === null || v.trim() === "") return null;
  const x = Number(v);
  return Number.isInteger(x) ? x : Number.NaN;
};

/**
 * The client book. Searchable, filterable and sortable on the server. `?picker=1` returns a light list for the invoice,
 * proposal and retainer pickers (name search, no archived or walk-in clients, with what they owe and their credit position).
 */
export async function GET(request: Request) {
  const auth = await requireClientAccess("clients.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.ctx;
  const sp = new URL(request.url).searchParams;
  const page = int(sp.get("page"));
  const limit = int(sp.get("limit"));
  if (Number.isNaN(page) || Number.isNaN(limit)) return clientError(400, "PAGINATION_INVALID_PARAMS", "Invalid pagination parameters");
  if ((page !== null && page < 0) || (limit !== null && limit < 0)) return clientError(400, "PAGINATION_NEGATIVE_VALUES", "Pagination parameters cannot be negative");

  try {
    if (sp.get("picker") === "1") {
      const q = sp.get("q")?.trim();
      const rows = await prisma.client.findMany({
        where: { workspaceId, isWalkIn: false, archivedAt: null, ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { taxId: { contains: q.toUpperCase() } }] } : {}) },
        orderBy: { name: "asc" }, take: Math.min(50, limit ?? 20),
        select: { id: true, name: true, email: true, country: true, countryCode: true, isExport: true, gstStateCode: true, taxId: true, currency: true, paymentTermsDays: true, creditLimit: true, status: true, logoUrl: true },
      });
      const metrics = await clientMetrics(workspaceId, rows.map((r) => r.id));
      return NextResponse.json({ data: rows.map((r) => { const m = metrics.get(r.id); const limitN = r.creditLimit === null ? null : Number(r.creditLimit); return { ...r, creditLimit: limitN, outstanding: m?.outstanding ?? 0, overdue: m?.overdue ?? 0, credit: creditStatus(limitN, m?.outstanding ?? 0) }; }) });
    }

    const sort = sp.get("sort");
    const view = sp.get("view");
    const result = await listClients(workspaceId, {
      q: sp.get("q") ?? undefined,
      view: view === "vip" || view === "inactive" || view === "archived" || view === "all" ? view : "active",
      tag: sp.get("tag") ?? undefined,
      country: sp.get("country") ?? undefined,
      owner: sp.get("owner") ?? undefined,
      sort: sort === "recent" || sort === "outstanding" || sort === "revenue" || sort === "activity" || sort === "risk" ? sort : "name",
      page: page ?? 1,
      limit: limit ?? 25,
    });
    const extra = sp.get("summary") === "1" ? { summary: await clientBookSummary(workspaceId), tags: await listTags(workspaceId) } : {};
    return NextResponse.json({ ...result, ...extra }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API Error fetching clients:", error);
    return clientError(500, "CLIENTS_FETCH_FAILED", "Failed to fetch clients");
  }
}

export async function POST(request: Request) {
  const auth = await requireClientAccess("clients.manage");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const body = await readClientBody(request);
  if (!body) return clientError(400, "INVALID_BODY", "Send the client details as a form or JSON.");
  const parsed = normalizeClientInput(body.fields, { workspaceCountry: ctx.workspaceCountry });
  if (!parsed.ok) return validationError(parsed.fields, parsed.suggestion);

  let logoUrl: string | null = null;
  if (body.logo) {
    const stored = await storeClientLogo(ctx.workspaceId, body.logo);
    if (!stored.ok) return stored.response;
    logoUrl = stored.url;
  }
  try {
    const res = await createClient(ctx, parsed.data, { source: "MANUAL", logoUrl, force: body.fields.force === true || body.fields.force === "true" });
    if (!res.ok) { await removeStoredLogo(logoUrl); return serviceError(res); }
    return NextResponse.json({ success: true, client: res.client }, { status: 201 });
  } catch (error) {
    console.error("Client create failed:", error);
    await removeStoredLogo(logoUrl);
    return clientError(500, "CLIENT_CREATE_FAILED", "Failed to create client");
  }
}
