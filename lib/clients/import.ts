import type { Prisma } from "@prisma/client";
import { FREE_TIER_CLIENT_LIMIT, shouldApplyFreeTierLimits } from "@/lib/entitlements";
import { duplicateKey, emailKey } from "./names";
import { normalizeClientInput } from "./schema";

type Mode = "create_only" | "upsert" | string;

/**
 * One row of a clients import. It follows the same rules as the form: the country is recognised (a typo is a row error, not a
 * silently foreign customer), GST treatment is derived, the Free plan limit applies, and an update only changes the columns
 * the file actually has (the old import overwrote address, country and tax ID with blanks).
 */
export async function importClientRow(tx: Prisma.TransactionClient, workspaceId: string, workspaceCountry: string, data: Record<string, unknown>, mode: Mode): Promise<"imported" | "updated" | "skipped"> {
  const raw: Record<string, unknown> = {};
  for (const k of ["name", "email", "phone", "address", "country", "taxId", "website", "industry", "currency", "tags"]) {
    const v = data[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") raw[k] = String(v);
  }
  const name = String(raw.name ?? "").trim();
  if (!name) throw new Error("Client name is required.");

  const candidates = await tx.client.findMany({ where: { workspaceId, isWalkIn: false, OR: [{ name }, ...(raw.email ? [{ email: emailKey(String(raw.email)) }] : [])] }, select: { id: true, name: true, email: true, country: true, countryCode: true, taxId: true, isExport: true } });
  const key = duplicateKey(name);
  const existing = candidates.find((c) => c.name === name) ?? candidates.find((c) => duplicateKey(c.name) === key) ?? candidates.find((c) => raw.email && c.email && emailKey(c.email) === emailKey(String(raw.email)));

  if (existing) {
    if (mode === "create_only") return "skipped";
    const parsed = normalizeClientInput({ ...raw, name: undefined }, { workspaceCountry, partial: true, existing });
    if (!parsed.ok) throw new Error(parsed.fields.map((f) => `${f.field}: ${f.code}`).join(", "));
    if (Object.keys(parsed.data).length) await tx.client.update({ where: { id: existing.id }, data: parsed.data });
    return "updated";
  }

  const parsed = normalizeClientInput({ address: "", ...raw }, { workspaceCountry });
  if (!parsed.ok) throw new Error(parsed.fields.map((f) => `${f.field}: ${f.code}`).join(", "));
  const ws = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { planTier: true, subscriptionStatus: true, subscriptionEndsAt: true, _count: { select: { clients: { where: { isWalkIn: false, archivedAt: null } } } } } });
  if (ws && shouldApplyFreeTierLimits(ws) && ws._count.clients >= FREE_TIER_CLIENT_LIMIT) throw new Error(`The Free plan allows ${FREE_TIER_CLIENT_LIMIT} clients. Upgrade to import more.`);
  const d = parsed.data;
  await tx.client.create({ data: { workspaceId, name: d.name as string, address: d.address ?? "", country: d.country ?? "", countryCode: d.countryCode ?? null, taxId: d.taxId ?? null, gstStateCode: d.gstStateCode ?? null, gstSupplyOverride: d.gstSupplyOverride ?? null, gstReverseCharge: d.gstReverseCharge ?? false, email: d.email ?? null, phone: d.phone ?? null, website: d.website ?? null, industry: d.industry ?? null, currency: d.currency ?? null, tags: d.tags ?? "", isExport: d.isExport ?? false, source: "IMPORT" } });
  return "imported";
}
