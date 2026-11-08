/** Retainer lifecycle. DUE is derived (active and past its billing date); it is never stored. */
export const STORED_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED", "COMPLETED"] as const;
export type RetainerStatus = (typeof STORED_STATUSES)[number];
export type RetainerDisplayStatus = RetainerStatus | "DUE";
export const FREQUENCIES = ["MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
export type RetainerFrequency = (typeof FREQUENCIES)[number];

export const OWNER_TRANSITIONS: Record<RetainerStatus, readonly RetainerStatus[]> = {
  ACTIVE: ["PAUSED", "CANCELLED"],
  PAUSED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
};

export function normalizeStatus(value: string): RetainerStatus {
  return (STORED_STATUSES as readonly string[]).includes(value) ? (value as RetainerStatus) : "ACTIVE";
}

export function canTransition(from: string, to: string): boolean {
  return (STORED_STATUSES as readonly string[]).includes(from) && OWNER_TRANSITIONS[from as RetainerStatus].includes(to as RetainerStatus);
}

export function startOfUtcDay(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isDue(status: string, nextBillingDate: Date, now = new Date()): boolean {
  return status === "ACTIVE" && startOfUtcDay(nextBillingDate) <= startOfUtcDay(now);
}

export function getDisplayStatus(status: string, nextBillingDate: Date, now = new Date()): RetainerDisplayStatus {
  const s = normalizeStatus(status);
  return isDue(s, nextBillingDate, now) ? "DUE" : s;
}

/** Only retainers that never produced an invoice can be hard-deleted; otherwise they are cancelled to keep history. */
export function canHardDelete(cyclesBilled: number, invoiceCount: number): boolean {
  return cyclesBilled === 0 && invoiceCount === 0;
}
