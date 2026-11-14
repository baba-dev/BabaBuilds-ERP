/** Pure collections logic: no database, so it is cheap to test and the same rules drive the list, the reminders and the nightly job. */

const DAY = 86_400_000;
export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

export const FOLLOW_UP_STATUSES = ["UNTOUCHED", "REMINDER_SENT", "FOLLOWUP_SCHEDULED", "PROMISE_TO_PAY", "PROMISE_BROKEN", "DISPUTED", "ESCALATED"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const AGING_BUCKETS = [
  { key: "current", min: 0, max: 0 },
  { key: "d1_30", min: 1, max: 30 },
  { key: "d31_60", min: 31, max: 60 },
  { key: "d61_90", min: 61, max: 90 },
  { key: "d90_plus", min: 91, max: Number.POSITIVE_INFINITY },
] as const;
export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

export function bucketOf(daysOverdue: number): AgingBucketKey {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90_plus";
}

export type Tone = "friendly" | "firm" | "final";
export type DunningConfig = {
  /** Send nightly reminders on their own. */
  autoReminders: boolean;
  /** Each step fires once the invoice is this many days overdue; the next one only after the minimum gap. */
  steps: Array<{ afterDays: number; tone: Tone }>;
  minGapDays: number;
  /** A live promise to pay, a dispute or an escalation pauses reminders. */
  pauseOnPromise: boolean;
};
export const DEFAULT_DUNNING: DunningConfig = {
  autoReminders: false,
  steps: [{ afterDays: 3, tone: "friendly" }, { afterDays: 10, tone: "firm" }, { afterDays: 25, tone: "final" }],
  minGapDays: 4,
  pauseOnPromise: true,
};

export function sanitizeDunning(raw: unknown): DunningConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
  const tones: Tone[] = ["friendly", "firm", "final"];
  let steps = Array.isArray(r.steps)
    ? r.steps.filter((s) => Number((s as { afterDays?: unknown }).afterDays) >= 1).map((s) => ({ afterDays: clamp((s as { afterDays?: unknown }).afterDays, 1, 365, 0), tone: tones.includes((s as { tone?: Tone }).tone as Tone) ? ((s as { tone: Tone }).tone) : "friendly" })).filter((s) => s.afterDays > 0).slice(0, 6)
    : DEFAULT_DUNNING.steps;
  steps = [...steps].sort((a, b) => a.afterDays - b.afterDays);
  return {
    autoReminders: r.autoReminders === true,
    steps: steps.length ? steps : DEFAULT_DUNNING.steps,
    minGapDays: clamp(r.minGapDays, 1, 60, DEFAULT_DUNNING.minGapDays),
    pauseOnPromise: r.pauseOnPromise !== false,
  };
}

export type InvoiceLike = {
  invoiceDate: Date; dueDate: Date | null; paymentTermsDays: number | null;
  totalAmount: number; amountReceived: number; exchangeRate: number;
  followUpStatus: string | null; promiseDate: Date | null; nextFollowUpAt: Date | null;
  lastReminderSentAt: Date | null; collectionReminders: number; collectionRiskScore: number | null;
};
export type Behavior = { avgDaysToPay: number | null; lateRate: number | null; partialPaymentRate: number | null } | null;

/** The date money was due: the invoice's due date, else invoice date plus its terms (so an invoice with no due date is not "current" forever). */
export function effectiveDue(inv: Pick<InvoiceLike, "invoiceDate" | "dueDate" | "paymentTermsDays">, defaultTermsDays = 30): Date {
  return inv.dueDate ?? addDays(inv.invoiceDate, inv.paymentTermsDays ?? defaultTermsDays);
}
export function daysOverdue(due: Date, now: Date): number {
  return Math.max(0, Math.floor((startOfDay(now).getTime() - startOfDay(due).getTime()) / DAY));
}
/** What is still owed, in the workspace currency. */
export function outstandingBase(inv: Pick<InvoiceLike, "totalAmount" | "amountReceived" | "exchangeRate">): number {
  return Math.max(0, inv.totalAmount - inv.amountReceived) * (inv.exchangeRate > 0 ? inv.exchangeRate : 1);
}

export type StatusView = { status: FollowUpStatus; promiseActive: boolean; promiseBroken: boolean; disputed: boolean; snoozed: boolean; paused: boolean };
export function statusView(inv: Pick<InvoiceLike, "followUpStatus" | "promiseDate" | "nextFollowUpAt">, now: Date, cfg: DunningConfig): StatusView {
  const raw = (FOLLOW_UP_STATUSES as readonly string[]).includes(inv.followUpStatus ?? "") ? (inv.followUpStatus as FollowUpStatus) : "UNTOUCHED";
  const today = startOfDay(now);
  const promiseActive = raw === "PROMISE_TO_PAY" && !!inv.promiseDate && startOfDay(inv.promiseDate) >= today;
  // A promise whose day has passed with the invoice still open is broken, whether or not anyone has updated the status.
  const promiseBroken = raw === "PROMISE_BROKEN" || (raw === "PROMISE_TO_PAY" && !!inv.promiseDate && startOfDay(inv.promiseDate) < today);
  const disputed = raw === "DISPUTED";
  const snoozed = !!inv.nextFollowUpAt && inv.nextFollowUpAt.getTime() > now.getTime();
  const paused = disputed || raw === "ESCALATED" || snoozed || (cfg.pauseOnPromise && promiseActive);
  return { status: promiseBroken ? "PROMISE_BROKEN" : raw, promiseActive, promiseBroken, disputed, snoozed, paused };
}

/** Score 0 to 100. A figure someone typed wins; otherwise it is worked out from how this customer has paid before and how this invoice has gone. */
export function riskScore(inv: Pick<InvoiceLike, "collectionRiskScore">, behavior: Behavior, overdue: number, promiseBroken: boolean): { score: number; source: "manual" | "auto" } {
  if (inv.collectionRiskScore != null && Number.isFinite(inv.collectionRiskScore)) return { score: Math.max(0, Math.min(100, Math.round(inv.collectionRiskScore))), source: "manual" };
  let s = 25;
  if (behavior) {
    s += (behavior.lateRate ?? 0) * 30;
    s += (behavior.partialPaymentRate ?? 0) * 10;
    if (behavior.avgDaysToPay != null && behavior.avgDaysToPay > 45) s += Math.min(15, (behavior.avgDaysToPay - 45) / 3);
  } else s += 10; // no history is a mild unknown
  s += Math.min(30, overdue / 3);
  if (promiseBroken) s += 15;
  return { score: Math.max(0, Math.min(100, Math.round(s))), source: "auto" };
}

/** Which step of the ladder comes next: the one after those already sent, but never one that is gentler than the invoice's age calls for. */
export function stageFor(sent: number, overdue: number, cfg: DunningConfig): number {
  let eligible = -1;
  cfg.steps.forEach((s, i) => { if (overdue >= s.afterDays) eligible = i; });
  return Math.max(sent, eligible);
}

export type NextAction =
  | { kind: "NONE" } | { kind: "REMIND"; tone: Tone; step: number } | { kind: "WAIT_REPLY" } | { kind: "WAIT_PROMISE"; date: Date }
  | { kind: "CALL" } | { kind: "ESCALATE" } | { kind: "RESOLVE_DISPUTE" } | { kind: "SNOOZED"; until: Date };

export function nextAction(inv: Pick<InvoiceLike, "lastReminderSentAt" | "collectionReminders" | "promiseDate" | "nextFollowUpAt">, sv: StatusView, overdue: number, outstanding: number, cfg: DunningConfig, now: Date, bigAmount: number): NextAction {
  if (overdue <= 0) return { kind: "NONE" };
  if (sv.disputed) return { kind: "RESOLVE_DISPUTE" };
  if (sv.status === "ESCALATED") return { kind: "CALL" };
  if (sv.snoozed && inv.nextFollowUpAt) return { kind: "SNOOZED", until: inv.nextFollowUpAt };
  if (sv.promiseActive && inv.promiseDate) return { kind: "WAIT_PROMISE", date: inv.promiseDate };
  if (sv.promiseBroken) return { kind: "CALL" };
  const count = inv.collectionReminders;
  const idx = stageFor(count, overdue, cfg);
  const step = cfg.steps[idx];
  const gapOk = !inv.lastReminderSentAt || now.getTime() - inv.lastReminderSentAt.getTime() >= cfg.minGapDays * DAY;
  if (step && overdue >= step.afterDays && gapOk) return { kind: "REMIND", tone: step.tone, step: idx };
  if (!step && gapOk && overdue > (cfg.steps[cfg.steps.length - 1]?.afterDays ?? 0)) return { kind: outstanding >= bigAmount || overdue > 45 ? "ESCALATE" : "CALL" };
  return { kind: "WAIT_REPLY" };
}

/** Higher means look at it sooner. Paused invoices sink, broken promises and big old balances rise. */
export function priority(args: { overdue: number; outstanding: number; amountReference: number; risk: number; promiseBroken: boolean; paused: boolean; escalated: boolean }): number {
  const amountWeight = Math.min(100, (args.outstanding / Math.max(1, args.amountReference)) * 100);
  const ageWeight = Math.min(100, args.overdue * 1.5);
  let p = ageWeight * 0.4 + amountWeight * 0.3 + args.risk * 0.3 + (args.promiseBroken ? 20 : 0) + (args.escalated ? 15 : 0);
  if (args.overdue <= 0) p *= 0.25;
  if (args.paused) p *= 0.4;
  return Math.round(p);
}

/** Average days from invoice to payment, weighted by amount, over invoices paid in the last 90 days. */
export function dsoFrom(paid: Array<{ invoiceDate: Date; paidAt: Date; amount: number }>): number | null {
  const total = paid.reduce((s, p) => s + p.amount, 0);
  if (!paid.length || total <= 0) return null;
  return Math.round(paid.reduce((s, p) => s + Math.max(0, (p.paidAt.getTime() - p.invoiceDate.getTime()) / DAY) * p.amount, 0) / total);
}
