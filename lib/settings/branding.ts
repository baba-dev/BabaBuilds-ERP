import "server-only";
import fs from "fs";
import path from "path";
import { scanBuffer } from "@/lib/security/clamav";
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from "@/lib/uploads/private-storage";

export type BrandingKind = "logo" | "signature";

const RULES: Record<BrandingKind, { dir: "logos" | "signatures"; exts: string[]; types: string[]; maxBytes: number; label: string }> = {
  logo: { dir: "logos", exts: [".png", ".jpg", ".jpeg", ".webp"], types: ["png", "jpeg", "webp"], maxBytes: 2 * 1024 * 1024, label: "PNG, JPG or WEBP" },
  signature: { dir: "signatures", exts: [".png", ".webp"], types: ["png", "webp"], maxBytes: 1024 * 1024, label: "PNG or WEBP" },
};

/** Validates (type, real content, size, malware) and stores a logo or signature. Returns the stored URL or a user-facing error. */
export async function storeBrandingImage(workspaceId: string, kind: BrandingKind, file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const rule = RULES[kind];
  const ext = path.extname(file.name).toLowerCase();
  if (!rule.exts.includes(ext)) return { ok: false, error: `Only ${rule.label} files are allowed.` };
  if (file.size > rule.maxBytes) return { ok: false, error: `The file is too large. The limit is ${Math.round(rule.maxBytes / 1024 / 1024)} MB.` };
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = sniffAllowedContent(buffer);
  if (!detected || !rule.types.includes(detected)) return { ok: false, error: `That file is not a real ${rule.label} image.` };
  if (!(await scanBuffer(buffer))) return { ok: false, error: "The file was flagged by the malware scan." };
  const storedName = uniqueStoredName(kind, ext);
  const abs = buildPrivatePath(rule.dir, [workspaceId, storedName]);
  await ensureDir(path.dirname(abs));
  await fs.promises.writeFile(abs, buffer, { mode: 0o600 });
  return { ok: true, url: `/${rule.dir}/${workspaceId}/${storedName}` };
}
