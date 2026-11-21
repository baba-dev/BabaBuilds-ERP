import "server-only";
import fs from "fs";
import path from "path";
import { scanBuffer } from "@/lib/security/clamav";
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from "@/lib/uploads/private-storage";

export const MAX_PAYMENT_QR_IMAGES = 3;

const EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const TYPES = ["png", "jpeg", "webp"];
const MAX_BYTES = 1024 * 1024;
const MAX_SIDE = 3000;
const STORED_SIDE = 800;

/**
 * Validates (extension, real content, size, pixel size, malware) and stores an uploaded payment QR image, re-encoded as a
 * bounded PNG. Uploaded QRs carry no amount; they are printed with an "enter the amount" hint.
 */
export async function storePaymentQrImage(workspaceId: string, _label: string, file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const ext = path.extname(file.name).toLowerCase();
  if (!EXTS.includes(ext)) return { ok: false, error: "Only PNG, JPG or WEBP images are allowed." };
  if (file.size > MAX_BYTES) return { ok: false, error: "The image is too large. The limit is 1 MB." };
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = sniffAllowedContent(buffer);
  if (!detected || !TYPES.includes(detected)) return { ok: false, error: "That file is not a real PNG, JPG or WEBP image." };
  if (!(await scanBuffer(buffer))) return { ok: false, error: "The file was flagged by the malware scan." };

  const sharp = (await import("sharp")).default;
  let normalized: Buffer;
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_SIDE * MAX_SIDE });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || meta.width > MAX_SIDE || meta.height > MAX_SIDE) return { ok: false, error: "The image is too large. The limit is 3000 px on each side." };
    normalized = await image.rotate().resize({ width: STORED_SIDE, height: STORED_SIDE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    return { ok: false, error: "That image could not be read. Try a different file." };
  }

  const storedName = uniqueStoredName("qr", ".png");
  const abs = buildPrivatePath("payment-qr", [workspaceId, storedName]);
  await ensureDir(path.dirname(abs));
  await fs.promises.writeFile(abs, normalized, { mode: 0o600 });
  return { ok: true, path: `/payment-qr/${workspaceId}/${storedName}` };
}
