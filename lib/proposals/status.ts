/** Proposal lifecycle. EXPIRED is derived (past `validUntil` while still open); it is never stored. */

export const STORED_STATUSES = ["DRAFT", "SENT", "VIEWED", "REVISION_REQUESTED", "ACCEPTED", "DECLINED", "INVOICED"] as const;
export type StoredProposalStatus = (typeof STORED_STATUSES)[number];
export type ProposalDisplayStatus = StoredProposalStatus | "EXPIRED";

/** Statuses in which the client can still act on the proposal. */
export const OPEN_STATUSES: readonly StoredProposalStatus[] = ["SENT", "VIEWED", "REVISION_REQUESTED"];

/** Statuses the owner may edit the content of (the client has not committed yet). */
export const EDITABLE_STATUSES: readonly StoredProposalStatus[] = ["DRAFT", "SENT", "VIEWED", "REVISION_REQUESTED", "DECLINED"];

/**
 * Manual transitions the owner can request through PATCH /status.
 * SENT happens only through the send endpoint, INVOICED only through conversion, and the client's own
 * actions (VIEWED, REVISION_REQUESTED, ACCEPTED via the link) go through the public API.
 */
export const OWNER_TRANSITIONS: Record<StoredProposalStatus, readonly StoredProposalStatus[]> = {
  DRAFT: [],
  SENT: ["DRAFT", "DECLINED", "ACCEPTED"],
  VIEWED: ["DRAFT", "DECLINED", "ACCEPTED"],
  REVISION_REQUESTED: ["DRAFT", "DECLINED", "ACCEPTED"],
  DECLINED: ["DRAFT"],
  ACCEPTED: [],
  INVOICED: [],
};

export function isStoredStatus(value: unknown): value is StoredProposalStatus {
  return typeof value === "string" && (STORED_STATUSES as readonly string[]).includes(value);
}

export function normalizeStatus(value: string): StoredProposalStatus {
  return isStoredStatus(value) ? value : "DRAFT";
}

export function canOwnerTransition(from: string, to: string): boolean {
  return isStoredStatus(from) && isStoredStatus(to) && OWNER_TRANSITIONS[from].includes(to);
}

export function isEditable(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function startOfUtcDay(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** A proposal is valid through the whole `validUntil` day. */
export function isExpired(status: string, validUntil: Date, now = new Date()): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status) && startOfUtcDay(validUntil) < startOfUtcDay(now);
}

export function getDisplayStatus(status: string, validUntil: Date, now = new Date()): ProposalDisplayStatus {
  const stored = normalizeStatus(status);
  return isExpired(stored, validUntil, now) ? "EXPIRED" : stored;
}
