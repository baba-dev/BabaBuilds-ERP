import type { ProposalDisplayStatus, StoredProposalStatus } from "@/lib/proposals/status";

/** Client-safe DTOs shared by /api/proposals/* and the proposals UI. Money = decimal strings. */

export type ProposalListItemDto = {
  id: string;
  proposalNo: string;
  title: string;
  clientId: string;
  clientName: string;
  status: StoredProposalStatus;
  displayStatus: ProposalDisplayStatus;
  currency: string;
  subtotal: string;
  estimatedTax: string;
  totalAmount: string;
  validUntil: string;
  /** Whole days until expiry (negative when already past). */
  daysToExpiry: number;
  dateCreated: string;
  sentAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  acceptedAt: string | null;
  itemCount: number;
  optionalCount: number;
  revision: number;
  publicToken: string;
  archived: boolean;
  invoice: { id: string; invoiceNumber: string } | null;
};

export type ProposalItemDto = {
  id: string;
  serviceTemplateId: string | null;
  title: string;
  description: string | null;
  quantity: number;
  unitPrice: string;
  total: string;
  isOptional: boolean;
  isSelected: boolean;
  isRecurring: boolean;
};

export type ProposalMilestoneDto = { id: string; title: string; description: string | null; amount: string; dueDate: string | null; status: string };
export type ProposalSectionDto = { title: string; body: string; mediaUrl: string };
export type ProposalMediaDto = { type: "image" | "video"; url: string; title: string };

export type ProposalTimelineEventDto = { id: string; type: string; message: string | null; createdAt: string };

export type ProposalDetailDto = ProposalListItemDto & {
  clientEmail: string | null;
  taxRatePercent: number;
  exchangeRate: string;
  acceptedByName: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  items: ProposalItemDto[];
  milestones: ProposalMilestoneDto[];
  richSections: ProposalSectionDto[];
  richMedia: ProposalMediaDto[];
  timeline: ProposalTimelineEventDto[];
  retainers: Array<{ id: string; serviceName: string | null }>;
};

export type ProposalListResponse = {
  data: ProposalListItemDto[];
  meta: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
    statusCounts: Record<ProposalDisplayStatus, number>;
    focusFound?: boolean;
  };
};

export type ProposalSummaryDto = {
  baseCurrency: string;
  /** Sent proposals still waiting on the client (not expired), in base currency. */
  openValue: string;
  openCount: number;
  /** Accepted but not yet invoiced: money that is one click from becoming an invoice. */
  readyToInvoiceValue: string;
  readyToInvoiceCount: number;
  expiringSoonCount: number;
  draftCount: number;
  /** Share (0-100) of decided proposals (accepted/invoiced vs declined/expired) in the window; null if none. */
  winRate: number | null;
  avgDaysToAccept: number | null;
  windowDays: number;
};

export type ProposalPreviewDto = {
  subtotal: string;
  estimatedTax: string;
  totalAmount: string;
  taxRatePercent: number;
  taxLabel: string;
  isTaxExempt: boolean;
  lineTotals: string[];
};

/** What the unauthenticated client may see through the share link. Never the raw rows. */
export type PublicProposalDto = {
  id: string;
  proposalNo: string;
  title: string;
  status: StoredProposalStatus;
  displayStatus: ProposalDisplayStatus;
  currency: string;
  subtotal: string;
  estimatedTax: string;
  totalAmount: string;
  taxRatePercent: number;
  taxLabel: string;
  validUntil: string;
  acceptedAt: string | null;
  business: { name: string; logoUrl: string | null };
  clientName: string;
  items: Array<{ id: string; title: string; description: string | null; quantity: number; unitPrice: string; total: string; isOptional: boolean; isSelected: boolean }>;
  milestones: Array<{ title: string; description: string | null; amount: string; dueDate: string | null }>;
  richSections: ProposalSectionDto[];
  richMedia: ProposalMediaDto[];
  hasRevisionRequest: boolean;
};
