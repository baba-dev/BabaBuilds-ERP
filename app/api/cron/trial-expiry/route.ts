/**
 * GET /api/cron/trial-expiry
 *
 * Expires workspaces whose trial end date has passed.
 * crontab example (daily at 06:00):
 *   0 6 * * * curl -s -X GET https://yourdomain.com/api/cron/trial-expiry \
 *              -H "Authorization: Bearer $CRON_SECRET"
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized, unauthorizedCronResponse } from "@/lib/security/cron-auth";
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  const now = new Date();
  const soonThreshold = addDays(startOfDay(now), 3);

  try {
    const expired = await prisma.workspace.updateMany({
      where: {
        subscriptionStatus: "TRIALING",
        subscriptionEndsAt: { lt: now },
      },
      data: {
        subscriptionStatus: "FREE",
        planTier: "FREE",
      },
    });

    const endingSoon = await prisma.workspace.findMany({
      where: {
        subscriptionStatus: "TRIALING",
        subscriptionEndsAt: {
          gte: now,
          lte: soonThreshold,
        },
      },
      select: {
        id: true,
        name: true,
        subscriptionEndsAt: true,
        users: {
          where: { role: "OWNER", isActive: true },
          take: 1,
          select: { user: { select: { email: true } } },
        },
      },
    });

    let remindersSent = 0;
    for (const workspace of endingSoon) {
      const ownerEmail = workspace.users[0]?.user?.email;
      if (!ownerEmail || !workspace.subscriptionEndsAt) continue;
      const daysLeft = differenceInCalendarDays(
        startOfDay(workspace.subscriptionEndsAt),
        startOfDay(now),
      );
      if (daysLeft < 0 || daysLeft > 3) continue;

      try {
        const { dispatchNotification } = await import("@/lib/notifications/dispatcher");
        await dispatchNotification({
          event: "RENEWAL_ALERT",
          workspaceId: workspace.id,
          data: {
            title: "Trial ending soon",
            message: `Your trial for ${workspace.name} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Upgrade in Settings → Billing to keep Pro features.`,
            actionUrl: "/settings/billing",
            recipientEmail: ownerEmail,
          },
        });
        remindersSent += 1;
      } catch {
        // Notification channel optional in dev
      }
    }

    return NextResponse.json({
      ok: true,
      expiredCount: expired.count,
      endingSoonChecked: endingSoon.length,
      remindersSent,
    });
  } catch (error) {
    console.error("[cron/trial-expiry]", error);
    return NextResponse.json({ ok: false, error: "Trial expiry cron failed" }, { status: 500 });
  }
}
