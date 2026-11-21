import { NextResponse } from "next/server";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { logActivity } from "@/lib/security/activity-log";
import { requireSettingsManager } from "@/lib/settings/access";
import { addPaymentQr, removePaymentQr } from "@/lib/settings/payment-qr-service";

/** Upload a static payment QR image (multipart: label + file). Up to three per workspace. */
export async function POST(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/settings/payment-qr", scope: "settings-payment-qr", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.actor;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an image to upload.", code: "FILE_REQUIRED" }, { status: 400 });

  const result = await addPaymentQr(workspaceId, form.get("label"), file);
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  logActivity({ action: "settings_payment_qr_added", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "workspace_settings", id: workspaceId }, request });
  return NextResponse.json({ success: true, item: result.item });
}

/** Remove one of the workspace's QR images (JSON: { id }). */
export async function DELETE(request: Request) {
  const limit = await enforceRouteRateLimit({ request, route: "/api/settings/payment-qr", scope: "settings-payment-qr", max: 30, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.actor;

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const result = await removePaymentQr(workspaceId, body?.id);
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  logActivity({ action: "settings_payment_qr_removed", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "workspace_settings", id: workspaceId }, request });
  return NextResponse.json({ success: true });
}
