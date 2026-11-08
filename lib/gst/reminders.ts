import "server-only";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { loadGstProfile } from "./data";
import { getGstOverview } from "./service";
import { getGstIssues } from "./issues";
import { planDigest, planReminders } from "./reminder-plan";

async function claim(workspaceId: string, key: string, channel: "INAPP" | "EMAIL"): Promise<boolean> {
  try {
    await prisma.gstReminderLog.create({ data: { workspaceId, key, channel } });
    return true;
  } catch {
    return false; // unique violation: already sent
  }
}

/** Sends today's reminders for every opted-in India workspace. Idempotent per (workspace, reminder). */
export async function runGstReminders(now = new Date()): Promise<{ workspaces: number; reminders: number; digests: number }> {
  const profiles = await prisma.businessProfile.findMany({ where: { gstRegistrationType: { not: "UNREGISTERED" }, gstRemindersEnabled: true, workspace: { countryCode: "IN" } }, select: { workspaceId: true } });
  let reminders = 0;
  let digests = 0;
  const monday = now.getUTCDay() === 1;
  for (const { workspaceId } of profiles) {
    try {
      const profile = await loadGstProfile(workspaceId);
      if (!profile.gstin) continue;
      const overview = await getGstOverview(workspaceId);
      for (const item of planReminders(overview, now)) {
        if (!(await claim(workspaceId, item.key, "INAPP"))) continue;
        await dispatchNotification({ event: "GST_REMINDER", workspaceId, data: { title: item.title, body: item.body, actionUrl: item.actionUrl } });
        reminders += 1;
      }
      if (monday) {
        const issues = (await getGstIssues(workspaceId, now)).filter((i) => i.severity !== "info").length;
        const digest = planDigest(overview, issues, now);
        if (digest && (await claim(workspaceId, digest.key, "EMAIL"))) {
          await dispatchNotification({ event: "GST_DIGEST", workspaceId, data: { title: digest.title, body: digest.body, lines: digest.lines } });
          digests += 1;
        }
      }
    } catch (error) {
      console.error("GST reminders failed for workspace", workspaceId, error);
    }
  }
  return { workspaces: profiles.length, reminders, digests };
}
