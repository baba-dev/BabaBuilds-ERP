import "server-only";
import path from "path";
import { writeFile } from "fs/promises";
import { scanBuffer } from "@/lib/security/clamav";
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from "@/lib/uploads/private-storage";
import { MAX_IMAGE_BYTES } from "@/lib/services/validation";

export type ImageResult = { ok: true; url: string } | { ok: false; status: number; code: string; message: string };

/** Validates (size, extension, magic bytes, malware scan) and stores a service hero image. */
export async function saveServiceImage(workspaceId: string, file: File): Promise<ImageResult> {
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, code: "IMAGE_TOO_LARGE", message: "Image is too large (5 MB max)." };
  }
  const ext = path.extname(file.name).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return { ok: false, status: 400, code: "INVALID_IMAGE_TYPE", message: "Invalid image type. Only PNG, JPG, or WEBP allowed." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const sniffed = sniffAllowedContent(buffer);
  if (sniffed !== "png" && sniffed !== "jpeg" && sniffed !== "webp") {
    return { ok: false, status: 415, code: "UNSAFE_IMAGE", message: "Unsupported or unsafe image content." };
  }
  if (!(await scanBuffer(buffer))) {
    return { ok: false, status: 400, code: "MALWARE_DETECTED", message: "Malware detected in uploaded file." };
  }

  const dir = buildPrivatePath("service-hero", [workspaceId]);
  await ensureDir(dir);
  const filename = uniqueStoredName("hero", ext);
  await writeFile(path.join(dir, filename), buffer, { mode: 0o600 });
  return { ok: true, url: `/uploads/service-hero/${workspaceId}/${filename}` };
}
