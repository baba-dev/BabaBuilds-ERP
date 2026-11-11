import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { GooglePlayApiError, isGooglePlayConfigured } from "@/lib/billing/google-play-client";
import { PlayPurchaseRejectedError } from "@/lib/billing/play-products";
import { PlayBindingError, syncPlayPurchase } from "@/lib/billing/play-subscription";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from "@/lib/rbac";
import { getClientIp } from "@/lib/request-ip";

/**
 * POST /api/billing/play/verify   { purchaseToken: string }
 *
 * Called by the Android app (Trusted Web Activity) right after Google Play completes a purchase.
 * The client's claim is never trusted: the token is re-read from Google, bound to the caller's workspace,
 * acknowledged, and only then does the workspace get its entitlement.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    const userId = session?.user?.id;
    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Same owner-only gate as cancelling a subscription.
    await requirePermission(userId, workspaceId, "billing.manage");

    const rl = checkRateLimit(`play-verify:${workspaceId}:${getClientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many attempts. Try again shortly.", retryAfterMs: rl.retryAfterMs }, { status: 429 });
    }

    if (!isGooglePlayConfigured()) {
      return NextResponse.json({ error: "Google Play billing is not available right now." }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as { purchaseToken?: unknown };
    const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
    if (purchaseToken.length < 10 || purchaseToken.length > 4096) {
      return NextResponse.json({ error: "Invalid purchase token." }, { status: 400 });
    }

    const result = await syncPlayPurchase({
      purchaseToken,
      workspaceId,
      source: "client_verify",
      actor: { userId, email: session?.user?.email },
    });

    if (result.ignored) {
      return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      entitled: result.entitled,
      // PENDING (e.g. cash payment methods) is valid: access is granted when Google confirms payment.
      pending: !result.entitled && result.state === "SUBSCRIPTION_STATE_PENDING",
      interval: result.interval,
      expiresAt: result.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    if (error instanceof PlayBindingError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus });
    if (error instanceof PlayPurchaseRejectedError) return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    if (error instanceof GooglePlayApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status === 404 ? 404 : error.status === 503 ? 503 : 502 });
    }
    console.error("Play purchase verification failed:", error);
    return NextResponse.json({ error: "Could not verify the purchase." }, { status: 500 });
  }
}
