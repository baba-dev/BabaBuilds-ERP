import { NextResponse } from "next/server";

import { GooglePlayApiError } from "@/lib/billing/google-play-client";
import { PlayPurchaseRejectedError, type PlayDeveloperNotification } from "@/lib/billing/play-products";
import { PlayBindingError, markPlayOrderRefunded, syncPlayPurchase } from "@/lib/billing/play-subscription";
import { timingSafeEqualString } from "@/lib/security/signature";

/**
 * POST /api/billing/play/rtdn?token=<GOOGLE_PLAY_RTDN_SECRET>
 *
 * Google Play real-time developer notifications arrive through a Pub/Sub PUSH subscription:
 *   { message: { data: <base64 JSON>, messageId }, subscription }
 * Authentication: Pub/Sub push endpoints are public URLs, so the push URL carries a shared secret
 * (compared in constant time). The notification body is only a hint: the purchase is always re-read
 * from Google before anything changes, so a forged body cannot grant access.
 *
 * Response codes drive Pub/Sub retries: 2xx = done (including notifications we deliberately ignore),
 * 5xx = retry later.
 */
export async function POST(req: Request) {
  const secret = process.env.GOOGLE_PLAY_RTDN_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const provided = new URL(req.url).searchParams.get("token") ?? "";
  if (!provided || !timingSafeEqualString(secret, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let notification: PlayDeveloperNotification;
  try {
    const envelope = (await req.json()) as { message?: { data?: string } };
    const data = envelope.message?.data;
    if (!data) return NextResponse.json({ error: "Missing message" }, { status: 400 });
    notification = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as PlayDeveloperNotification;
  } catch {
    // Malformed payloads never become valid on retry.
    return NextResponse.json({ error: "Malformed notification" }, { status: 400 });
  }

  const expectedPackage = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (notification.packageName && expectedPackage && notification.packageName !== expectedPackage) {
    return NextResponse.json({ ok: true, ignored: "other_package" });
  }
  if (notification.testNotification) return NextResponse.json({ ok: true, test: true });

  try {
    const sub = notification.subscriptionNotification;
    if (sub?.purchaseToken) {
      await syncPlayPurchase({ purchaseToken: sub.purchaseToken, source: "rtdn" });
      return NextResponse.json({ ok: true });
    }

    const voided = notification.voidedPurchaseNotification;
    if (voided?.purchaseToken) {
      if (voided.orderId) await markPlayOrderRefunded(voided.orderId);
      await syncPlayPurchase({ purchaseToken: voided.purchaseToken, source: "voided" });
      return NextResponse.json({ ok: true });
    }

    // One-time-product / other notification types are not used by this app.
    return NextResponse.json({ ok: true, ignored: "unsupported_type" });
  } catch (error) {
    if (error instanceof PlayBindingError || error instanceof PlayPurchaseRejectedError) {
      // Permanent for this message: retrying cannot help.
      return NextResponse.json({ ok: true, ignored: error.name });
    }
    if (error instanceof GooglePlayApiError && error.status === 404) {
      return NextResponse.json({ ok: true, ignored: "unknown_purchase" });
    }
    console.error("Play RTDN handling failed:", error);
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
  }
}
