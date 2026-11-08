import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { buildBaseWhere, buildListWhere, buildOrderBy, parseRetainerListQuery } from "@/lib/retainers/query";
import { listInclude, serializeListItem } from "@/lib/retainers/serialize";
import { retainerInputSchema } from "@/lib/retainers/validation";
import { priceRetainer } from "@/lib/retainers/pricing";
import { afterRetainerChange, createRetainer, resolveCurrency } from "@/lib/retainers/save";
import { startOfUtcDay, type RetainerDisplayStatus } from "@/lib/retainers/status";
import type { RetainerListResponse } from "@/lib/retainers/types";

export async function GET(request: Request) {
  const auth = await requireRetainerAccess("retainers.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.access;
  const parsed = parseRetainerListQuery(new URL(request.url).searchParams);
  if (!parsed.success) return retainerError(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "Invalid query.");
  const q = parsed.data;
  const now = new Date();
  try {
    const where = buildListWhere(workspaceId, q, now);
    const endOfToday = new Date(startOfUtcDay(now) + 86_399_999);
    const base = buildBaseWhere(workspaceId, q);
    const [totalRecords, rows, grouped, dueCount] = await Promise.all([
      prisma.retainer.count({ where }),
      prisma.retainer.findMany({ where, include: listInclude, orderBy: buildOrderBy(q), skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.retainer.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      prisma.retainer.count({ where: { AND: [base, { status: "ACTIVE", nextBillingDate: { lte: endOfToday } }] } }),
    ]);
    const counts: Record<RetainerDisplayStatus, number> = { ACTIVE: 0, PAUSED: 0, CANCELLED: 0, COMPLETED: 0, DUE: 0 };
    for (const g of grouped) if (g.status in counts) counts[g.status as RetainerDisplayStatus] += g._count._all;
    counts.DUE = dueCount;
    counts.ACTIVE = Math.max(0, counts.ACTIVE - dueCount);

    let data = rows.map((r) => serializeListItem(r, now));
    let focusFound: boolean | undefined;
    if (q.focus && !data.some((d) => d.id === q.focus)) {
      const f = await prisma.retainer.findFirst({ where: { id: q.focus, workspaceId }, include: listInclude });
      focusFound = Boolean(f);
      if (f) data = [serializeListItem(f, now), ...data];
    }
    const body: RetainerListResponse = {
      data,
      meta: { page: q.page, limit: q.limit, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / q.limit)), statusCounts: counts, ...(focusFound === undefined ? {} : { focusFound }) },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Fetch retainers error:", error);
    return retainerError(500, "RETAINERS_FETCH_FAILED", "Failed to fetch retainers.");
  }
}

export async function POST(request: Request) {
  const auth = await requireRetainerAccess("retainers.manage");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;
  const parsed = retainerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return retainerError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid retainer.", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const input = parsed.data;
  if (input.endDate && Date.parse(input.endDate) < Date.parse(input.nextBillingDate)) {
    return retainerError(400, "VALIDATION_ERROR", "The end date must be after the first billing date.");
  }
  try {
    const priced = await priceRetainer(workspaceId, input);
    if (!priced.ok) return retainerError(priced.status, priced.code, priced.message, priced.details);
    const { currency, exchangeRate } = await resolveCurrency(workspaceId, input);
    const created = await createRetainer({ workspaceId, actorUserId: userId, input, pricing: priced.pricing, currency, exchangeRate });
    logActivity({ action: "retainer_created", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "retainer", id: created.id }, request });
    afterRetainerChange(workspaceId, "create");
    return NextResponse.json({ success: true, retainer: { id: created.id, status: created.status } });
  } catch (error) {
    console.error("Retainer creation error:", error);
    logActivity({ action: "retainer_created", status: "FAILURE", workspaceId, request, metadata: { error: String(error) } });
    return retainerError(500, "RETAINER_CREATE_FAILED", "Failed to create the retainer.");
  }
}
