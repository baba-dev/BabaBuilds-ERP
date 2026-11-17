import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { FREQUENCIES, startOfUtcDay } from "@/lib/retainers/status";
import { containsInsensitive } from "@/lib/prisma-filters";

const STATUS_FILTERS = ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED", "DUE"] as const;
const SORTS = ["nextBillingDate", "createdAt", "name", "status"] as const;

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    return (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()).filter(Boolean);
  }, z.array(item).max(8).optional());

export const retainerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  q: z.string().trim().max(120).optional(),
  status: csv(z.enum(STATUS_FILTERS)),
  frequency: z.enum(FREQUENCIES).optional(),
  clientId: z.string().trim().max(64).optional(),
  sort: z.enum(SORTS).default("nextBillingDate"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  focus: z.string().trim().max(64).optional(),
});
export type RetainerListQuery = z.infer<typeof retainerListQuerySchema>;

export function parseRetainerListQuery(sp: URLSearchParams) {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return retainerListQuerySchema.safeParse(raw);
}

export function buildBaseWhere(workspaceId: string, q: RetainerListQuery): Prisma.RetainerWhereInput {
  const and: Prisma.RetainerWhereInput[] = [];
  if (q.q) {
    and.push({ OR: [{ name: containsInsensitive(q.q) }, { client: { name: containsInsensitive(q.q) } }, { items: { some: { title: containsInsensitive(q.q) } } }] });
  }
  if (q.clientId) and.push({ clientId: q.clientId });
  if (q.frequency) and.push({ frequency: q.frequency });
  return { workspaceId, ...(and.length ? { AND: and } : {}) };
}

/** "Due" = active and past its date; "Active" in the list means active and not yet due, so chips never overlap. */
export function statusCondition(status: (typeof STATUS_FILTERS)[number], now: Date): Prisma.RetainerWhereInput {
  const endOfToday = new Date(startOfUtcDay(now) + 86_399_999);
  if (status === "DUE") return { status: "ACTIVE", nextBillingDate: { lte: endOfToday } };
  if (status === "ACTIVE") return { status: "ACTIVE", nextBillingDate: { gt: endOfToday } };
  return { status };
}

export function buildListWhere(workspaceId: string, q: RetainerListQuery, now = new Date()): Prisma.RetainerWhereInput {
  const base = buildBaseWhere(workspaceId, q);
  if (!q.status?.length) return base;
  return { AND: [base, { OR: q.status.map((s) => statusCondition(s, now)) }] };
}

export function buildOrderBy(q: RetainerListQuery): Prisma.RetainerOrderByWithRelationInput[] {
  return [{ [q.sort]: q.dir } as Prisma.RetainerOrderByWithRelationInput, { id: q.dir }];
}
