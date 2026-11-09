import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { logActivity } from "@/lib/security/activity-log";
import { canUsePaymentGateways, loadWorkspaceBillingSnapshot } from "@/lib/entitlements";
import { isProductionSecurityMode, isTestRazorpaySecretKey, isTestStripeSecretKey } from "@/lib/payment-key-safety";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { requireSettingsManager } from "@/lib/settings/access";
import { secretSchema } from "@/lib/settings/schemas";

/**
 * Set or clear one secret (SMTP password, AI key, gateway secrets). Values are encrypted at rest and never returned;
 * the audit log records which secret changed, never its value.
 */
export async function PUT(request: Request) {
  const limit = enforceRouteRateLimit({ request, route: "/api/settings/secrets", scope: "settings-secrets", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.actor;

  const body = secretSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request.", code: "INVALID_BODY" }, { status: 400 });
  const { key, value } = body.data;

  const isGateway = key === "razorpayKeySecret" || key === "stripeSecretKey";
  if (isGateway && value !== null) {
    const billing = await loadWorkspaceBillingSnapshot(workspaceId);
    if (!(billing ? canUsePaymentGateways(billing) : false)) return NextResponse.json({ error: "Payment gateway settings require an active Pro or Team plan.", code: "PAID_PLAN_REQUIRED" }, { status: 403 });
    if (isProductionSecurityMode() && ((key === "razorpayKeySecret" && isTestRazorpaySecretKey(value)) || (key === "stripeSecretKey" && isTestStripeSecretKey(value)))) {
      return NextResponse.json({ error: "Test keys are blocked in production mode.", code: "TEST_KEY_BLOCKED" }, { status: 400 });
    }
  }

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Save your business details first.", code: "PROFILE_REQUIRED" }, { status: 409 });

  await prisma.businessProfile.update({ where: { workspaceId }, data: { [key]: value === null ? null : encrypt(value) } });
  logActivity({ action: value === null ? "settings_secret_cleared" : "settings_secret_rotated", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "workspace_settings", id: workspaceId }, metadata: { secret: key }, request });
  return NextResponse.json({ success: true, key, configured: value !== null });
}
