import type { Prisma } from "@prisma/client";
import { getDisplayStatus, normalizeStatus, startOfUtcDay } from "@/lib/proposals/status";
import { buildTimeline } from "@/lib/proposals/events";
import type {
  ProposalDetailDto,
  ProposalListItemDto,
  ProposalMediaDto,
  ProposalSectionDto,
  PublicProposalDto,
} from "@/lib/proposals/types";

const DAY_MS = 86_400_000;

export const listInclude = {
  client: { select: { id: true, name: true, email: true } },
  items: { select: { isOptional: true } },
  generatedInvoices: { select: { id: true, invoiceNumber: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.ProposalInclude;

export const detailInclude = {
  client: { select: { id: true, name: true, email: true } },
  items: { orderBy: { id: "asc" as const } },
  billingMilestones: { orderBy: { createdAt: "asc" as const } },
  generatedInvoices: { select: { id: true, invoiceNumber: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
  generatedRetainers: { select: { id: true, serviceName: true } },
  events: { orderBy: { createdAt: "desc" as const }, take: 100 },
} satisfies Prisma.ProposalInclude;

type ListRow = Prisma.ProposalGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.ProposalGetPayload<{ include: typeof detailInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function serializeListItem(row: ListRow, now = new Date()): ProposalListItemDto {
  const status = normalizeStatus(row.status);
  return {
    id: row.id,
    proposalNo: row.proposalNo,
    title: row.title,
    clientId: row.clientId,
    clientName: row.client.name,
    status,
    displayStatus: getDisplayStatus(status, row.validUntil, now),
    currency: row.currency,
    subtotal: row.subtotal.toFixed(2),
    estimatedTax: row.estimatedTax.toFixed(2),
    totalAmount: row.totalAmount.toFixed(2),
    validUntil: row.validUntil.toISOString(),
    daysToExpiry: Math.round((startOfUtcDay(row.validUntil) - startOfUtcDay(now)) / DAY_MS),
    dateCreated: row.dateCreated.toISOString(),
    sentAt: iso(row.sentAt),
    viewCount: row.viewCount,
    lastViewedAt: iso(row.lastViewedAt),
    acceptedAt: iso(row.acceptedAt),
    itemCount: row.items.length,
    optionalCount: row.items.filter((i) => i.isOptional).length,
    revision: row.revision,
    publicToken: row.publicToken,
    archived: row.archivedAt !== null,
    invoice: row.generatedInvoices[0] ? { id: row.generatedInvoices[0].id, invoiceNumber: row.generatedInvoices[0].invoiceNumber } : null,
  };
}

export function readSections(value: unknown): ProposalSectionDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : null))
    .filter((s): s is Record<string, unknown> => s !== null)
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      body: typeof s.body === "string" ? s.body : "",
      mediaUrl: typeof s.mediaUrl === "string" ? s.mediaUrl : "",
    }))
    .filter((s) => s.title || s.body);
}

export function readMedia(value: unknown): ProposalMediaDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((m) => (m && typeof m === "object" ? (m as Record<string, unknown>) : null))
    .filter((m): m is Record<string, unknown> => m !== null && typeof m.url === "string" && m.url.length > 0)
    .map((m) => ({ type: m.type === "video" ? ("video" as const) : ("image" as const), url: String(m.url), title: typeof m.title === "string" ? m.title : "" }));
}

/** Free-text decline reason only; legacy rows stored a JSON bag in this column. */
export function readDeclineText(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return typeof parsed.clientNote === "string" && parsed.clientNote ? parsed.clientNote : null;
    } catch {
      return trimmed;
    }
  }
  return trimmed || null;
}

export function serializeDetail(row: DetailRow, now = new Date()): ProposalDetailDto {
  const base = serializeListItem({ ...row, items: row.items.map((i) => ({ isOptional: i.isOptional })) }, now);
  return {
    ...base,
    clientEmail: row.client.email,
    taxRatePercent: row.taxRatePercent,
    exchangeRate: row.exchangeRate.toString(),
    acceptedByName: row.acceptedByName,
    declinedAt: iso(row.declinedAt),
    declineReason: readDeclineText(row.declineReason),
    items: row.items.map((i) => ({
      id: i.id,
      serviceTemplateId: i.serviceTemplateId,
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
      total: i.total.toFixed(2),
      isOptional: i.isOptional,
      isSelected: i.isSelected,
      isRecurring: i.isRecurring,
    })),
    milestones: row.billingMilestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      amount: m.amount.toFixed(2),
      dueDate: iso(m.dueDate),
      status: m.status,
    })),
    richSections: readSections(row.richSections),
    richMedia: readMedia(row.richMedia),
    timeline: buildTimeline(
      {
        dateCreated: row.dateCreated,
        sentAt: row.sentAt,
        firstViewedAt: row.firstViewedAt,
        acceptedAt: row.acceptedAt,
        declinedAt: row.declinedAt,
        firstConvertedAt: row.firstConvertedAt,
        status: row.status,
      },
      row.events,
    ),
    retainers: row.generatedRetainers,
  };
}

export const publicInclude = {
  client: { select: { name: true } },
  items: { orderBy: { id: "asc" as const } },
  billingMilestones: { orderBy: { createdAt: "asc" as const } },
  events: { where: { type: "REVISION_REQUESTED" }, select: { id: true }, take: 1 },
} satisfies Prisma.ProposalInclude;

type PublicRow = Prisma.ProposalGetPayload<{ include: typeof publicInclude }>;

/** The only shape the unauthenticated share link ever returns: no ids of other records, IPs, tax IDs or notes. */
export function serializePublic(
  row: PublicRow,
  business: { name: string; logoUrl: string | null; taxLabel: string },
  now = new Date(),
): PublicProposalDto {
  const status = normalizeStatus(row.status);
  return {
    id: row.id,
    proposalNo: row.proposalNo,
    title: row.title,
    status,
    displayStatus: getDisplayStatus(status, row.validUntil, now),
    currency: row.currency,
    subtotal: row.subtotal.toFixed(2),
    estimatedTax: row.estimatedTax.toFixed(2),
    totalAmount: row.totalAmount.toFixed(2),
    taxRatePercent: row.taxRatePercent,
    taxLabel: business.taxLabel,
    validUntil: row.validUntil.toISOString(),
    acceptedAt: iso(row.acceptedAt),
    business: { name: business.name, logoUrl: business.logoUrl },
    clientName: row.client.name,
    items: row.items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
      total: i.total.toFixed(2),
      isOptional: i.isOptional,
      isSelected: i.isSelected,
    })),
    milestones: row.billingMilestones.map((m) => ({ title: m.title, description: m.description, amount: m.amount.toFixed(2), dueDate: iso(m.dueDate) })),
    richSections: readSections(row.richSections),
    richMedia: readMedia(row.richMedia),
    hasRevisionRequest: row.status === "REVISION_REQUESTED" || row.events.length > 0,
  };
}
