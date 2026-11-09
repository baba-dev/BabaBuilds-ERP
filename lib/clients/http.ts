import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { scanBuffer } from "@/lib/security/clamav";
import { CLIENT_LOGO_INVALID_TYPE_ERROR, isAllowedClientLogoExtension } from "@/lib/uploads/client-logo";
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from "@/lib/uploads/private-storage";
import { clientError } from "./access";
import type { FieldIssue } from "./schema";
import type { ServiceError } from "./service";

export type ClientBody = { fields: Record<string, unknown>; logo: File | null };

/** Accepts the form (multipart, with a logo) or plain JSON. Empty file inputs are ignored. */
export async function readClientBody(request: Request): Promise<ClientBody | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = await request.json();
      return body && typeof body === "object" ? { fields: body as Record<string, unknown>, logo: null } : null;
    }
    const form = await request.formData();
    const fields: Record<string, unknown> = {};
    let logo: File | null = null;
    for (const [k, v] of form.entries()) {
      if (v instanceof File) { if (k === "logo" && v.size > 0) logo = v; } else fields[k] = v;
    }
    return { fields, logo };
  } catch {
    return null;
  }
}

export const validationError = (fields: FieldIssue[], suggestion?: unknown) => NextResponse.json({ error: "Check the highlighted fields.", code: "VALIDATION", fields, ...(suggestion ? { suggestion } : {}) }, { status: 422 });
export const serviceError = (e: ServiceError) => clientError(e.status, e.code, e.message, e.extra);

/** Type, real content and malware checks, then a private file. Returns the stored URL or an error response. */
export async function storeClientLogo(workspaceId: string, file: File): Promise<{ ok: true; url: string } | { ok: false; response: NextResponse }> {
  const ext = path.extname(file.name).toLowerCase();
  if (!isAllowedClientLogoExtension(ext)) return { ok: false, response: NextResponse.json({ error: CLIENT_LOGO_INVALID_TYPE_ERROR, code: "INVALID_FILE_TYPE" }, { status: 400 }) };
  if (file.size > 2 * 1024 * 1024) return { ok: false, response: clientError(413, "FILE_TOO_LARGE", "The logo is too large. The limit is 2 MB.") };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await scanBuffer(buffer))) return { ok: false, response: clientError(400, "MALWARE_DETECTED", "Malware detected in uploaded file.") };
  const sniffed = sniffAllowedContent(buffer);
  if (!sniffed || !["png", "jpeg", "webp", "gif"].includes(sniffed)) return { ok: false, response: clientError(415, "INVALID_FILE_TYPE", "Unsupported or unsafe logo content.") };
  const stored = uniqueStoredName("client", ext);
  const abs = buildPrivatePath("logos", [workspaceId, stored]);
  await ensureDir(path.dirname(abs));
  await fs.writeFile(abs, buffer, { mode: 0o600 });
  return { ok: true, url: `/logos/${workspaceId}/${stored}` };
}

export async function removeStoredLogo(url: string | null | undefined) {
  if (!url?.startsWith("/logos/")) return;
  const segments = url.replace(/^\/logos\//, "").split("/").filter(Boolean);
  try { await fs.unlink(buildPrivatePath("logos", segments)); } catch { /* already gone */ }
}
