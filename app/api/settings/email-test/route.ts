import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { logActivity } from "@/lib/security/activity-log";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { requireSettingsManager } from "@/lib/settings/access";

/** Sends a test message through the saved SMTP settings to the signed-in user, so a wrong password shows up here and not on a client's invoice. */
export async function POST(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/settings/email-test", scope: "settings-email-test", max: 5, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.actor;
  if (!email) return NextResponse.json({ error: "Your account has no email address to send the test to.", code: "NO_RECIPIENT" }, { status: 400 });

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) return NextResponse.json({ error: "Save the mail server, user and password first.", code: "SMTP_INCOMPLETE" }, { status: 409 });

  try {
    await sendEmail({ route: "user", profile, to: email, subject: "Test message from BabaBuilds ERP", html: "<p>Your mail settings work. Invoices and reminders will be sent from this account.</p>", text: "Your mail settings work. Invoices and reminders will be sent from this account." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logActivity({ action: "settings_email_test", status: "FAILURE", workspaceId, actor: { userId, email }, entity: { type: "workspace_settings", id: workspaceId }, metadata: { reason: message.slice(0, 160) }, request });
    // The provider's reason is the useful part (bad login, blocked host), and it never contains the password.
    return NextResponse.json({ error: message.slice(0, 200), code: "SMTP_FAILED" }, { status: 502 });
  }
  logActivity({ action: "settings_email_test", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "workspace_settings", id: workspaceId }, request });
  return NextResponse.json({ success: true, sentTo: email });
}
