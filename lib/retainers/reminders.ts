import "server-only";
import { prisma } from "@/lib/prisma";
import { sendArReminderEmailForInvoice } from "@/lib/ar-collections";
import { addRetainerEvent } from "@/lib/retainers/events";
import { REMINDER_OFFSETS_DAYS } from "@/lib/retainers/schedule";

const DAY = 86_400_000;
export type ReminderRunResult = { checked: number; sent: number; failed: number; gaveUp: number };

/**
 * Automatic collections for retainer invoices: reminders go out 3, 7 and 14 days after the due date through the same
 * email path as the manual "send reminder" action. Disable per retainer with `remindersEnabled`.
 */
export async function runRetainerReminders(now = new Date()): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { checked: 0, sent: 0, failed: 0, gaveUp: 0 };
  const invoices = await prisma.invoice.findMany({
    where: {
      retainerId: { not: null },
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
      reminderCount: { lt: REMINDER_OFFSETS_DAYS.length },
      retainer: { remindersEnabled: true, status: { not: "CANCELLED" } },
    },
    select: { id: true, workspaceId: true, retainerId: true, dueDate: true, reminderCount: true, lastReminderSentAt: true, invoiceNumber: true },
    take: 500,
  });

  for (const inv of invoices) {
    result.checked += 1;
    const dueAt = inv.dueDate!.getTime() + REMINDER_OFFSETS_DAYS[inv.reminderCount] * DAY;
    if (now.getTime() < dueAt) continue;
    if (inv.lastReminderSentAt && now.getTime() - inv.lastReminderSentAt.getTime() < DAY) continue;

    const sent = await sendArReminderEmailForInvoice(inv.workspaceId, inv.id);
    if (sent.ok) {
      result.sent += 1;
      await prisma.invoice.update({ where: { id: inv.id }, data: { reminderCount: { increment: 1 } } });
      await addRetainerEvent(prisma, { workspaceId: inv.workspaceId, retainerId: inv.retainerId!, type: "REMINDER_SENT", message: `${inv.invoiceNumber} · reminder ${inv.reminderCount + 1} of ${REMINDER_OFFSETS_DAYS.length}` }).catch(() => null);
    } else if (sent.code === "NO_CLIENT_EMAIL" || sent.code === "SMTP_NOT_CONFIGURED") {
      // Permanent for now: record once and stop retrying every day.
      result.gaveUp += 1;
      await prisma.invoice.update({ where: { id: inv.id }, data: { reminderCount: REMINDER_OFFSETS_DAYS.length } });
      await addRetainerEvent(prisma, { workspaceId: inv.workspaceId, retainerId: inv.retainerId!, type: "REMINDER_FAILED", message: `${inv.invoiceNumber} · ${sent.code === "NO_CLIENT_EMAIL" ? "client has no email" : "email is not configured"}` }).catch(() => null);
    } else {
      result.failed += 1; // transient: try again on the next run
    }
  }
  return result;
}
