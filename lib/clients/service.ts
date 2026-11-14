import "server-only";
import fs from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FREE_TIER_CLIENT_LIMIT, shouldApplyFreeTierLimits } from "@/lib/entitlements";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from "@/lib/dashboard-cache";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { logActivity } from "@/lib/security/activity-log";
import { buildPrivatePath } from "@/lib/uploads/private-storage";
import type { ClientCtx } from "./access";
import { duplicateKey, emailKey } from "./names";
import { diffClient, type ClientColumns } from "./schema";
import { parseTags, serializeTags } from "./tags";

export type ServiceError = { ok: false; status: 404 | 409 | 403 | 400; code: string; message: string; extra?: Record<string, unknown> };
export type ClientSource = "MANUAL" | "IMPORT" | "AI" | "POS";

const audit = (ctx: ClientCtx, action: string, id: string | null, metadata?: Record<string, unknown>) =>
  logActivity({ action, status: "SUCCESS", workspaceId: ctx.workspaceId, actor: { userId: ctx.userId ?? undefined, email: ctx.email ?? undefined }, entity: { type: "client", id }, metadata }).catch(() => null);

function bust(workspaceId: string, action: string) {
  try { invalidateDashboardCacheForWorkspace(workspaceId); } catch { noteDashboardCacheIncident("invalidationFailures", { workspaceId, entity: "client", action }); }
}

/** Existing clients that look like the same company: the same cleaned name, or the same email. */
export async function findSimilarClients(workspaceId: string, name: string | undefined, email: string | null | undefined, excludeId?: string) {
  const key = name ? duplicateKey(name) : "";
  const first = key.split(" ")[0];
  const or: Prisma.ClientWhereInput[] = [];
  if (first && first.length >= 2) or.push({ name: { contains: first } });
  if (email) or.push({ email: emailKey(email) });
  if (!or.length) return [];
  const rows = await prisma.client.findMany({ where: { workspaceId, isWalkIn: false, ...(excludeId ? { id: { not: excludeId } } : {}), OR: or }, select: { id: true, name: true, email: true, archivedAt: true }, take: 60 });
  return rows.filter((r) => (key && duplicateKey(r.name) === key) || (email && r.email && emailKey(r.email) === emailKey(email)));
}

export async function createClient(ctx: ClientCtx, data: Partial<ClientColumns>, opts: { source: ClientSource; logoUrl?: string | null; force?: boolean; enforcePlanLimit?: boolean; walkIn?: boolean }): Promise<{ ok: true; client: Awaited<ReturnType<typeof prisma.client.create>> } | ServiceError> {
  if (opts.enforcePlanLimit !== false && !opts.walkIn) {
    const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, _count: { select: { clients: { where: { isWalkIn: false, archivedAt: null } } } } } });
    if (!ws) return { ok: false, status: 404, code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" };
    if (shouldApplyFreeTierLimits(ws) && ws._count.clients >= FREE_TIER_CLIENT_LIMIT) {
      return { ok: false, status: 403, code: "PLAN_LIMIT_REACHED", message: `You have reached the limit of ${FREE_TIER_CLIENT_LIMIT} clients on the Free plan. Upgrade to Pro for unlimited clients.`, extra: { requiresUpgrade: true } };
    }
  }
  if (!opts.walkIn && !opts.force) {
    const similar = await findSimilarClients(ctx.workspaceId, data.name, data.email);
    if (similar.length) return { ok: false, status: 409, code: "CLIENT_DUPLICATE", message: `${similar[0].name} looks like the same client.`, extra: { existing: similar.slice(0, 3).map((s) => ({ id: s.id, name: s.name })) } };
  }
  try {
    const client = await prisma.client.create({
      data: {
        workspaceId: ctx.workspaceId,
        name: data.name ?? "Walk-in Customer", address: data.address ?? "", country: data.country ?? "", countryCode: data.countryCode ?? null,
        taxId: data.taxId ?? null, gstStateCode: data.gstStateCode ?? null, gstSupplyOverride: data.gstSupplyOverride ?? null, gstReverseCharge: data.gstReverseCharge ?? false,
        email: data.email ?? null, phone: data.phone ?? null, website: data.website ?? null, industry: data.industry ?? null, currency: data.currency ?? null,
        paymentTermsDays: data.paymentTermsDays ?? null, creditLimit: data.creditLimit ?? null, tags: data.tags ?? "", status: data.status ?? "ACTIVE",
        ownerUserId: data.ownerUserId ?? ctx.userId, isExport: data.isExport ?? false, logoUrl: opts.logoUrl ?? null, source: opts.source, isWalkIn: !!opts.walkIn,
      },
    });
    bust(ctx.workspaceId, "create");
    if (!opts.walkIn) {
      dispatchNotification({ event: "CLIENT_ADDED", workspaceId: ctx.workspaceId, data: { clientName: client.name } }).catch(() => null);
      void audit(ctx, "client_created", client.id, { source: opts.source });
    }
    return { ok: true, client };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, status: 409, code: "CLIENT_NAME_TAKEN", message: "You already have a client with that exact name." };
    throw error;
  }
}

export async function updateClient(ctx: ClientCtx, id: string, patch: Partial<ClientColumns>, opts: { logoUrl?: string | null } = {}): Promise<{ ok: true; client: NonNullable<Awaited<ReturnType<typeof prisma.client.findFirst>>>; changed: string[] } | ServiceError> {
  const existing = await prisma.client.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) return { ok: false, status: 404, code: "CLIENT_NOT_FOUND", message: "Client not found" };
  if (patch.ownerUserId) {
    const member = await prisma.workspaceUser.findFirst({ where: { workspaceId: ctx.workspaceId, userId: patch.ownerUserId, isActive: true }, select: { id: true } });
    if (!member) return { ok: false, status: 400, code: "OWNER_INVALID", message: "The account owner has to be a member of this workspace." };
  }
  const data: Prisma.ClientUncheckedUpdateInput = { ...patch, ...(opts.logoUrl !== undefined ? { logoUrl: opts.logoUrl } : {}) };
  const changed = diffClient(existing as unknown as Record<string, unknown>, { ...patch, ...(opts.logoUrl !== undefined ? { logoUrl: opts.logoUrl } : {}) });
  try {
    await prisma.client.update({ where: { id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, status: 409, code: "CLIENT_NAME_TAKEN", message: "You already have a client with that exact name." };
    throw error;
  }
  const client = await prisma.client.findFirstOrThrow({ where: { id, workspaceId: ctx.workspaceId } });
  bust(ctx.workspaceId, "update");
  void audit(ctx, "client_updated", id, { changedFieldNames: changed });
  return { ok: true, client, changed };
}

export async function setArchived(ctx: ClientCtx, id: string, archived: boolean): Promise<{ ok: true } | ServiceError> {
  const res = await prisma.client.updateMany({ where: { id, workspaceId: ctx.workspaceId, isWalkIn: false }, data: { archivedAt: archived ? new Date() : null } });
  if (res.count === 0) return { ok: false, status: 404, code: "CLIENT_NOT_FOUND", message: "Client not found" };
  bust(ctx.workspaceId, archived ? "archive" : "restore");
  void audit(ctx, archived ? "client_archived" : "client_restored", id);
  return { ok: true };
}

export async function deleteClient(ctx: ClientCtx, id: string): Promise<{ ok: true } | ServiceError> {
  const client = await prisma.client.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, logoUrl: true, isWalkIn: true } });
  if (!client) return { ok: false, status: 404, code: "CLIENT_NOT_FOUND", message: "Client not found" };
  const [invoices, proposals, retainers] = await Promise.all([
    prisma.invoice.count({ where: { clientId: id, workspaceId: ctx.workspaceId } }),
    prisma.proposal.count({ where: { clientId: id, workspaceId: ctx.workspaceId } }),
    prisma.retainer.count({ where: { clientId: id, workspaceId: ctx.workspaceId } }),
  ]);
  if (invoices || proposals || retainers || client.isWalkIn) {
    return { ok: false, status: 409, code: "CLIENT_HAS_DEPENDENCIES", message: "This client has billing history, so it cannot be deleted. Archive it instead: it disappears from lists and pickers and the history stays intact.", extra: { details: { invoiceCount: invoices, proposalCount: proposals, retainerCount: retainers }, canArchive: !client.isWalkIn } };
  }
  await prisma.client.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  if (client.logoUrl?.startsWith("/logos/")) {
    const segments = client.logoUrl.replace(/^\/logos\//, "").split("/").filter(Boolean);
    await fs.unlink(buildPrivatePath("logos", segments)).catch(() => undefined);
  }
  bust(ctx.workspaceId, "delete");
  void audit(ctx, "client_deleted", id);
  return { ok: true };
}

/** Everything the source had moves to the target, then the source goes. Billing history is never lost. */
export async function mergeClients(ctx: ClientCtx, sourceId: string, targetId: string): Promise<{ ok: true; moved: { invoices: number; proposals: number; retainers: number } } | ServiceError> {
  if (sourceId === targetId) return { ok: false, status: 400, code: "MERGE_SAME", message: "Choose two different clients." };
  const [source, target] = await Promise.all([
    prisma.client.findFirst({ where: { id: sourceId, workspaceId: ctx.workspaceId, isWalkIn: false } }),
    prisma.client.findFirst({ where: { id: targetId, workspaceId: ctx.workspaceId, isWalkIn: false } }),
  ]);
  if (!source || !target) return { ok: false, status: 404, code: "CLIENT_NOT_FOUND", message: "Client not found" };
  const moved = await prisma.$transaction(async (tx) => {
    const where = { clientId: sourceId, workspaceId: ctx.workspaceId };
    const [invoices, proposals, retainers] = await Promise.all([
      tx.invoice.updateMany({ where, data: { clientId: targetId, clientName: target.name } }),
      tx.proposal.updateMany({ where, data: { clientId: targetId } }),
      tx.retainer.updateMany({ where, data: { clientId: targetId } }),
    ]);
    await tx.mailBillingDomain.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.mailBillingSubscription.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.clientContact.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId, isPrimary: false } });
    await tx.clientNote.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.clientPaymentBehavior.deleteMany({ where: { clientId: sourceId } });
    // The target keeps its own details; blanks are filled from the source, and the tags are combined.
    const fill: Prisma.ClientUncheckedUpdateInput = { tags: serializeTags([...parseTags(target.tags), ...parseTags(source.tags)]) };
    for (const k of ["email", "phone", "website", "taxId", "industry", "currency", "gstStateCode"] as const) if (!target[k] && source[k]) (fill as Record<string, unknown>)[k] = source[k];
    if (target.paymentTermsDays === null && source.paymentTermsDays !== null) fill.paymentTermsDays = source.paymentTermsDays;
    if (target.creditLimit === null && source.creditLimit !== null) fill.creditLimit = source.creditLimit;
    await tx.client.update({ where: { id: targetId }, data: fill });
    await tx.client.delete({ where: { id: sourceId } });
    return { invoices: invoices.count, proposals: proposals.count, retainers: retainers.count };
  });
  bust(ctx.workspaceId, "merge");
  void audit(ctx, "client_merged", targetId, { mergedFromId: sourceId, mergedFromName: source.name, moved });
  return { ok: true, moved };
}

/** Who should receive a message: the contacts that opted in, otherwise the client's own address. Deduplicated, lower-cased. */
export async function getClientRecipients(clientId: string, workspaceId: string, purpose: "invoice" | "reminder" | "proposal"): Promise<string[]> {
  const client = await prisma.client.findFirst({ where: { id: clientId, workspaceId }, select: { email: true, contacts: { select: { email: true, isPrimary: true, receivesInvoices: true, receivesReminders: true } } } });
  if (!client) return [];
  const flag = purpose === "reminder" ? "receivesReminders" : "receivesInvoices";
  const fromContacts = client.contacts.filter((c) => c.email && c[flag]).map((c) => emailKey(c.email));
  const list = fromContacts.length ? fromContacts : client.email ? [emailKey(client.email)] : [];
  return Array.from(new Set(list));
}
