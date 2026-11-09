import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { invalidateDashboardCacheForWorkspace } from "@/lib/dashboard-cache";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";
import { requireSettingsManager } from "@/lib/settings/access";
import { storeBrandingImage, type BrandingKind } from "@/lib/settings/branding";

/** Upload (multipart: kind + file) or remove (multipart: kind + remove=true) the logo or signature. */
export async function POST(request: Request) {
  const limit = enforceRouteRateLimit({ request, route: "/api/settings/branding", scope: "settings-branding", max: 20, windowMs: 10 * 60 * 1000 });
  if (!limit.ok) return limit.response;
  const auth = await requireSettingsManager();
  if (!auth.ok) return auth.response;
  const { workspaceId, userId, email } = auth.actor;

  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  if (!form || (kind !== "logo" && kind !== "signature")) return NextResponse.json({ error: "Invalid request.", code: "INVALID_BODY" }, { status: 400 });
  const column = (kind as BrandingKind) === "logo" ? "logoUrl" : "signatureUrl";

  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Save your business details first.", code: "PROFILE_REQUIRED" }, { status: 409 });

  let url: string | null = null;
  if (form.get("remove") === "true") {
    await prisma.businessProfile.update({ where: { workspaceId }, data: { [column]: null } });
  } else {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose an image to upload.", code: "FILE_REQUIRED" }, { status: 400 });
    const stored = await storeBrandingImage(workspaceId, kind as BrandingKind, file);
    if (!stored.ok) return NextResponse.json({ error: stored.error, code: "FILE_REJECTED" }, { status: 400 });
    url = stored.url;
    await prisma.businessProfile.update({ where: { workspaceId }, data: { [column]: url } });
  }
  try { invalidateDashboardCacheForWorkspace(workspaceId); } catch { /* cache is best effort */ }
  logActivity({ action: url ? "settings_branding_updated" : "settings_branding_removed", status: "SUCCESS", workspaceId, actor: { userId, email }, entity: { type: "workspace_settings", id: workspaceId }, metadata: { kind }, request });
  return NextResponse.json({ success: true, kind, url });
}
