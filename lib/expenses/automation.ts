import "server-only";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { logActivity } from "@/lib/security/activity-log";
import { expenseGstSchema, normalizeExpenseGst } from "@/lib/gst/expense-gst";
import { loadGstProfile } from "@/lib/gst/data";
import { createExpenseWithSideEffects } from "./create-expense-with-side-effects";
import { dueDates, nextRun, type Frequency } from "./recurrence";
import { openPayables } from "./payables-data";

const DAY = 86_400_000;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

/** Posts every recurring expense that has come due. Autopost schedules post approved; the rest become drafts to confirm. Safe to run twice: a date already posted is skipped. */
export async function runDueRecurring(now = new Date(), workspaceId?: string): Promise<{ created: number; drafts: number; failed: number; workspaces: string[] }> {
  const templates = await prisma.recurringExpense.findMany({ where: { status: "ACTIVE", nextRunDate: { lte: now }, ...(workspaceId ? { workspaceId } : {}) }, take: 500 });
  let created = 0; let drafts = 0; let failed = 0;
  const draftWorkspaces = new Set<string>();
  const touched = new Set<string>();
  for (const t of templates) {
    try {
      const dates = dueDates(t.nextRunDate, t.frequency as Frequency, now, t.endDate);
      let gst: Record<string, unknown> | null = null;
      if (t.itcStatus !== "NONE" || t.paymentStatus === "UNPAID") {
        const parsed = expenseGstSchema.safeParse({ itcStatus: t.itcStatus, gstRate: t.gstRate, paymentStatus: t.paymentStatus });
        if (parsed.success) { const profile = await loadGstProfile(t.workspaceId); const n = normalizeExpenseGst(parsed.data, num(t.amount), profile.stateCode); if (n.ok) gst = n.data; }
      }
      for (const date of dates) {
        const dup = await prisma.expense.findFirst({ where: { recurringId: t.id, date }, select: { id: true } });
        if (dup) continue;
        await createExpenseWithSideEffects({
          workspaceId: t.workspaceId, userId: t.createdByUserId ?? "system-recurring", date, category: t.category, vendor: t.vendor, amount: num(t.amount), description: t.description,
          vendorId: t.vendorId, gst, recurringId: t.id, source: "RECURRING", approvalStatus: t.autoPost ? "APPROVED" : "DRAFT",
          dueDate: t.paymentStatus === "UNPAID" && t.dueInDays ? new Date(date.getTime() + t.dueInDays * DAY) : null,
        });
        created += 1; touched.add(t.workspaceId);
        if (!t.autoPost) { drafts += 1; draftWorkspaces.add(t.workspaceId); }
      }
      const last = dates.length ? dates[dates.length - 1] : t.nextRunDate;
      let next = dates.length ? nextRun(last, t.frequency as Frequency, t.nextRunDate.getUTCDate()) : t.nextRunDate;
      // A long-idle schedule skips ahead rather than posting a year of backlog.
      while (next.getTime() <= now.getTime() && (!t.endDate || next.getTime() <= t.endDate.getTime())) next = nextRun(next, t.frequency as Frequency, t.nextRunDate.getUTCDate());
      const ended = Boolean(t.endDate && next.getTime() > t.endDate.getTime());
      await prisma.recurringExpense.update({ where: { id: t.id }, data: { nextRunDate: next, lastRunAt: now, ...(ended ? { status: "ENDED" } : {}) } });
    } catch (error) {
      failed += 1;
      console.error("[expense-recurring]", t.id, error);
    }
  }
  for (const ws of draftWorkspaces) {
    void dispatchNotification({ event: "GST_REMINDER", workspaceId: ws, data: { title: "Recurring expenses ready to confirm", body: "Review the drafts in Expenses and approve the ones that went through.", actionUrl: "/expenses?view=review" } });
  }
  return { created, drafts, failed, workspaces: [...touched] };
}

/** One daily digest per workspace: bills due in the next 3 days and bills already late. Skipped if one went out in the last 20 hours. */
export async function sendPayablesDigest(workspaceId: string, now = new Date()): Promise<boolean> {
  const recent = await prisma.appActivityLog.findFirst({ where: { workspaceId, action: "expense_payables_digest", createdAt: { gte: new Date(now.getTime() - 20 * 3_600_000) } }, select: { id: true } });
  if (recent) return false;
  const items = await openPayables(workspaceId, now);
  const soon = items.filter((i) => i.dueDate.getTime() >= now.getTime() && i.dueDate.getTime() <= now.getTime() + 3 * DAY);
  const late = items.filter((i) => i.dueDate.getTime() < now.getTime());
  if (soon.length === 0 && late.length === 0) return false;
  const total = (xs: typeof items) => Math.round(xs.reduce((s, i) => s + i.amount, 0)).toLocaleString("en-IN");
  const parts: string[] = [];
  if (soon.length) parts.push(`${soon.length} due in the next 3 days (${total(soon)})`);
  if (late.length) parts.push(`${late.length} overdue (${total(late)})${late.some((i) => i.msme) ? ", including MSME suppliers with a 45-day limit" : ""}`);
  await dispatchNotification({ event: "GST_REMINDER", workspaceId, data: { title: "Bills to pay", body: parts.join("; "), actionUrl: "/expenses" } });
  void logActivity({ action: "expense_payables_digest", status: "SUCCESS", workspaceId, metadata: { soon: soon.length, late: late.length } });
  return true;
}

export async function runPayablesDigests(now = new Date()): Promise<{ considered: number; sent: number }> {
  const groups = await prisma.expense.groupBy({ by: ["workspaceId"], where: { approvalStatus: "APPROVED", paymentStatus: "UNPAID" }, _count: { _all: true }, orderBy: { workspaceId: "asc" }, take: 1000 });
  let sent = 0;
  for (const g of groups) { try { if (await sendPayablesDigest(g.workspaceId, now)) sent += 1; } catch (error) { console.error("[expense-digest]", g.workspaceId, error); } }
  return { considered: groups.length, sent };
}
