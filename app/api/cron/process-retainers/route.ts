import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized, unauthorizedCronResponse } from "@/lib/security/cron-auth";
import { billRetainer } from "@/lib/retainers/billing";
import { runRetainerReminders } from "@/lib/retainers/reminders";

/**
 * Daily billing run. Each due, ACTIVE retainer produces one invoice per run (a retainer that is several cycles behind
 * catches up one cycle per run and shows as "due" until it has). All the billing logic lives in lib/retainers/billing.ts.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();

  try {
    const now = new Date();
    const due = await prisma.retainer.findMany({
      where: { status: "ACTIVE", nextBillingDate: { lte: now } },
      select: { id: true, workspaceId: true, client: { select: { name: true } } },
      orderBy: { nextBillingDate: "asc" },
    });
    const reminders = await runRetainerReminders(now).catch((error) => {
      console.error("Retainer reminders failed:", error);
      return null;
    });
    if (due.length === 0) return NextResponse.json({ message: "No retainers due for processing today.", reminders });

    const stats = { processed: due.length, successful: 0, failed: 0, skipped: 0 };
    const logs: string[] = [];
    // Sequential on purpose: invoice numbers are allocated per workspace.
    for (const r of due) {
      const result = await billRetainer({ retainerId: r.id, workspaceId: r.workspaceId, trigger: "cron", now });
      if (result.ok) {
        stats.successful += 1;
        logs.push(`Billed ${r.client.name}: ${result.invoice.invoiceNumber}${result.emailed ? " (emailed)" : ""}`);
      } else if (result.skipped) {
        stats.skipped += 1;
        logs.push(`Skipped ${r.client.name}: ${result.message}`);
      } else {
        stats.failed += 1;
        logs.push(`FAILED: ${r.client.name} - ${result.message}`);
      }
    }
    return NextResponse.json({ message: "Cron execution complete", stats, reminders, logs });
  } catch (error) {
    console.error("Cron Execution Error:", error);
    return NextResponse.json({ error: "Failed to execute automated billing" }, { status: 500 });
  }
}
