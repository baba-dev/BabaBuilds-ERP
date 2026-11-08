import { daysUntilDue } from "./calendar";
import { exposureOf } from "./exposure";
import type { GstOverview } from "./service";

/** Days before the due date a reminder goes out (and the due date itself). Overdue returns repeat weekly. */
export const REMINDER_OFFSETS = [7, 3, 1, 0] as const;

export type ReminderPlanItem = { key: string; label: string; periodKey: string; returnType: string; title: string; body: string; actionUrl: string; days: number };

const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
const rupees = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

/** Which reminders are due today, given a workspace's overview. Pure so the schedule is testable. */
export function planReminders(overview: GstOverview, now: Date): ReminderPlanItem[] {
  const out: ReminderPlanItem[] = [];
  const week = `${now.getUTCFullYear()}-W${String(Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 1)) / 604800000)).padStart(2, "0")}`;
  for (const o of overview.obligations) {
    if (o.status === "FILED" || o.status === "OPEN_PERIOD" || o.optional && o.returnType !== "PMT06") continue;
    const due = o.extendedDueDate ?? o.dueDate;
    const days = daysUntilDue(due, now);
    const base = { label: o.label, periodKey: o.periodKey, returnType: o.returnType, actionUrl: `/tax?tab=${o.returnType === "GSTR3B" ? "gstr3b" : o.returnType === "GSTR9" ? "gstr9" : "gstr1"}&period=${o.periodKey}`, days };
    const cash = o.figures && o.returnType === "GSTR3B" && o.figures.cashPayable > 0 ? ` Estimated cash to pay: ${rupees(o.figures.cashPayable)}.` : "";
    if (days < 0) {
      out.push({ ...base, key: `${o.returnType}:${o.periodKey}:OVERDUE:${week}`, title: `${o.label} for ${o.periodKey} is overdue`, body: `It was due on ${fmtDate(due)}. Estimated late fee so far: ${rupees(o.lateFeeEstimate)}.${cash} File as soon as you can.` });
    } else if ((REMINDER_OFFSETS as readonly number[]).includes(days)) {
      out.push({ ...base, key: `${o.returnType}:${o.periodKey}:T-${days}`, title: days === 0 ? `${o.label} is due today` : `${o.label} is due in ${days} day${days === 1 ? "" : "s"}`, body: `${o.label} for ${o.periodKey} is due on ${fmtDate(due)}.${cash}` });
    }
  }
  return out;
}

export function planDigest(overview: GstOverview, issueCount: number, now: Date): { key: string; title: string; body: string; lines: string[] } | null {
  const upcoming = overview.obligations.filter((o) => o.status !== "FILED" && o.status !== "OPEN_PERIOD" && !o.optional);
  const exposure = exposureOf(overview.obligations);
  if (upcoming.length === 0 && issueCount === 0) return null;
  const week = `${now.getUTCFullYear()}-W${String(Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 1)) / 604800000)).padStart(2, "0")}`;
  const lines: string[] = [];
  for (const o of upcoming.slice(0, 5)) lines.push(`${o.label} ${o.periodKey}: ${o.status === "OVERDUE" ? "overdue" : `due ${fmtDate(o.extendedDueDate ?? o.dueDate)}`}`);
  if (issueCount > 0) lines.push(`${issueCount} data check${issueCount === 1 ? "" : "s"} to fix before filing`);
  if (overview.kpis.heldCredit > 0) lines.push(`${rupees(overview.kpis.heldCredit)} of input credit is on hold`);
  if (exposure.total > 0) lines.push(`Late-fee and interest exposure: ${rupees(exposure.total)}`);
  return { key: `DIGEST:${week}`, title: "What is blocking your GST filing this week", body: lines.length ? "Here is where things stand." : "Everything is in order.", lines };
}

