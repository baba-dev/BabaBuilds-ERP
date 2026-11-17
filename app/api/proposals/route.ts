import { NextResponse } from "next/server";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { logActivity } from "@/lib/security/activity-log";
import { proposalError, requireProposalAccess } from "@/lib/proposals/access";
import { buildBaseWhere, buildListWhere, buildOrderBy, parseProposalListQuery } from "@/lib/proposals/query";
import { listInclude, serializeListItem } from "@/lib/proposals/serialize";
import { proposalInputSchema } from "@/lib/proposals/validation";
import { checkMilestones, computeProposalTotals } from "@/lib/proposals/totals";
import { createProposal, resolveCurrency } from "@/lib/proposals/save";
import { startOfUtcDay, type ProposalDisplayStatus } from "@/lib/proposals/status";
import type { ProposalListResponse } from "@/lib/proposals/types";

async function refreshDashboard(workspaceId: string, action: string) {
  try {
    await invalidateDashboardCacheForWorkspace(workspaceId);
  } catch (error) {
    noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "proposal", action, error: String(error) });
  }
}


export async function GET(request: Request) {
  const auth = await requireProposalAccess("proposals.view");
  if (!auth.ok) return auth.response;
  const { workspaceId } = auth.access;

  const parsed = parseProposalListQuery(new URL(request.url).searchParams);
  if (!parsed.success) return proposalError(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "Invalid query.");
  const query = parsed.data;
  const now = new Date();

  try {
    const where = buildListWhere(workspaceId, query, now);
    const [totalRecords, rows, grouped, expiredGrouped] = await Promise.all([
      prisma.proposal.count({ where }),
      prisma.proposal.findMany({
        where,
        include: listInclude,
        orderBy: buildOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.proposal.groupBy({ by: ["status"], where: buildBaseWhere(workspaceId, query), _count: { _all: true } }),
      prisma.proposal.groupBy({
        by: ["status"],
        where: { AND: [buildBaseWhere(workspaceId, query), { status: { in: ["SENT", "VIEWED", "REVISION_REQUESTED"] }, validUntil: { lt: new Date(startOfUtcDay(now)) } }] },
        _count: { _all: true },
      }),
    ]);

    const statusCounts: Record<ProposalDisplayStatus, number> = {
      DRAFT: 0, SENT: 0, VIEWED: 0, REVISION_REQUESTED: 0, ACCEPTED: 0, DECLINED: 0, EXPIRED: 0, INVOICED: 0,
    };
    for (const g of grouped) {
      if (g.status in statusCounts) statusCounts[g.status as ProposalDisplayStatus] += g._count._all;
    }
    for (const g of expiredGrouped) {
      if (g.status in statusCounts) {
        statusCounts[g.status as ProposalDisplayStatus] -= g._count._all;
        statusCounts.EXPIRED += g._count._all;
      }
    }

    let focusFound: boolean | undefined;
    let data = rows.map((r) => serializeListItem(r, now));
    if (query.focus && !data.some((d) => d.id === query.focus)) {
      const focused = await prisma.proposal.findFirst({ where: { id: query.focus, workspaceId }, include: listInclude });
      focusFound = Boolean(focused);
      if (focused) data = [serializeListItem(focused, now), ...data];
    }

    const body: ProposalListResponse = {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / query.limit)),
        statusCounts,
        ...(focusFound === undefined ? {} : { focusFound }),
      },
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("Fetch Proposals Error:", error);
    return proposalError(500, "PROPOSALS_FETCH_FAILED", "Failed to fetch proposals.");
  }
}

export async function POST(request: Request) {
  const auth = await requireProposalAccess("proposals.create");
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.access;

  const json = await request.json().catch(() => null);
  const parsed = proposalInputSchema.safeParse(json);
  if (!parsed.success) {
    return proposalError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid proposal.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const input = parsed.data;

  try {
    const priced = await computeProposalTotals(workspaceId, input);
    if (!priced.ok) return proposalError(priced.status, priced.code, priced.message, priced.details);
    const milestoneError = checkMilestones(input.milestones, priced.totals.totalAmount);
    if (milestoneError) return proposalError(400, "MILESTONE_MISMATCH", milestoneError);

    const { currency, exchangeRate } = await resolveCurrency(workspaceId, input);
    const created = await createProposal({ workspaceId, actorUserId: userId, input, totals: priced.totals, currency, exchangeRate });

    dispatchNotification({
      event: "PROPOSAL_CREATED",
      workspaceId,
      data: { proposalNo: created.proposalNo, clientName: priced.client.name, amount: priced.totals.totalAmount.toFixed(2) },
    }).catch(() => null);
    logActivity({
      action: "proposal_created",
      status: "SUCCESS",
      workspaceId,
      actor: { userId, email },
      entity: { type: "proposal", id: created.id },
      request,
    });
    await refreshDashboard(workspaceId, "create");

    return NextResponse.json({
      success: true,
      proposal: { id: created.id, proposalNo: created.proposalNo, status: created.status, publicToken: created.publicToken },
      taxRateOverrideUsed: priced.totals.usedOverride ? priced.totals.taxRatePercent : null,
    });
  } catch (error) {
    console.error("Proposal Creation Error:", error);
    logActivity({ action: "proposal_created", status: "FAILURE", workspaceId, request, metadata: { error: String(error) } });
    return proposalError(500, "PROPOSAL_CREATE_FAILED", "Failed to create proposal.");
  }
}

