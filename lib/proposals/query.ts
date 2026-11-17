import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { OPEN_STATUSES, startOfUtcDay, type ProposalDisplayStatus } from "@/lib/proposals/status";
import { containsInsensitive } from "@/lib/prisma-filters";

export const MAX_PAGE_SIZE = 100;
const DISPLAY_STATUSES = ["DRAFT", "SENT", "VIEWED", "REVISION_REQUESTED", "ACCEPTED", "DECLINED", "EXPIRED", "INVOICED"] as const;
const SORT_FIELDS = ["dateCreated", "validUntil", "totalAmount", "title", "proposalNo", "status"] as const;

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const list = Array.isArray(value) ? value : String(value).split(",");
    return list.map((v) => String(v).trim()).filter(Boolean);
  }, z.array(item).max(12).optional());

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")
  .transform((v) => new Date(v));

export const proposalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(15),
  q: z.string().trim().max(120).optional(),
  status: csv(z.enum(DISPLAY_STATUSES)),
  clientId: z.string().trim().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  archived: z.enum(["0", "1"]).default("0"),
  sort: z.enum(SORT_FIELDS).default("dateCreated"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  focus: z.string().trim().max(64).optional(),
});

export type ProposalListQuery = z.infer<typeof proposalListQuerySchema>;

export function parseProposalListQuery(searchParams: URLSearchParams) {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const all = searchParams.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return proposalListQuerySchema.safeParse(raw);
}

/** Filters that do not depend on the status chips, so chip counts stay stable while filtering by status. */
export function buildBaseWhere(workspaceId: string, query: ProposalListQuery): Prisma.ProposalWhereInput {
  const and: Prisma.ProposalWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [{ title: containsInsensitive(query.q) }, { proposalNo: containsInsensitive(query.q) }, { client: { name: containsInsensitive(query.q) } }],
    });
  }
  if (query.clientId) and.push({ clientId: query.clientId });
  if (query.from || query.to) {
    and.push({ dateCreated: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lt: query.to } : {}) } });
  }
  and.push(query.archived === "1" ? { archivedAt: { not: null } } : { archivedAt: null });
  return { workspaceId, ...(and.length ? { AND: and } : {}) };
}

export function statusCondition(status: ProposalDisplayStatus, today: Date): Prisma.ProposalWhereInput {
  const open = OPEN_STATUSES as readonly ("SENT" | "VIEWED" | "REVISION_REQUESTED")[];
  if (status === "EXPIRED") return { status: { in: [...open] }, validUntil: { lt: today } };
  if ((open as readonly string[]).includes(status)) return { status, validUntil: { gte: today } };
  return { status };
}

export function buildListWhere(workspaceId: string, query: ProposalListQuery, now = new Date()): Prisma.ProposalWhereInput {
  const base = buildBaseWhere(workspaceId, query);
  if (!query.status?.length) return base;
  const today = new Date(startOfUtcDay(now));
  return { AND: [base, { OR: query.status.map((s) => statusCondition(s, today)) }] };
}

export function buildOrderBy(query: ProposalListQuery): Prisma.ProposalOrderByWithRelationInput[] {
  const dir = query.dir;
  const primary = { [query.sort]: dir } as Prisma.ProposalOrderByWithRelationInput;
  return [primary, { id: dir }];
}
