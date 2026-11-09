import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized, unauthorizedCronResponse } from "@/lib/security/cron-auth";
import { getModuleAvailability } from "@/lib/modules";
import { runReminderAutomation } from "@/lib/ar-collections";

/**
 * Daily overdue-invoice reminders for workspaces that switched AR Collections on AND opted in to automatic reminders.
 * Skips anyone whose module is off or whose plan has lapsed. Schedule it like the other cron routes (see AGENTS.md).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return unauthorizedCronResponse();

  const rows = await prisma.workspaceModule.findMany({
    where: { moduleKey: "AR_COLLECTIONS", isEnabled: true },
    select: { workspaceId: true, configJson: true },
    take: 500,
  });
  const optedIn = rows.filter((r) => (r.configJson as { autoReminders?: unknown } | null)?.autoReminders === true);

  let ran = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of optedIn) {
    if ((await getModuleAvailability(row.workspaceId, "AR_COLLECTIONS")) !== "enabled") { skipped += 1; continue; }
    try {
      await runReminderAutomation(row.workspaceId, { userId: null, email: null });
      ran += 1;
    } catch (error) {
      if ((error as { code?: string }).code === "RATE_LIMIT_COOLDOWN") skipped += 1;
      else { failed += 1; console.error("[cron/ar-reminders]", row.workspaceId, error); }
    }
  }
  return NextResponse.json({ ok: true, considered: rows.length, optedIn: optedIn.length, ran, skipped, failed }, { headers: { "Cache-Control": "no-store" } });
}
