import 'server-only';

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from '@/lib/uploads/private-storage';
import { InventoryError } from './service';

const EXT: Record<string, string[]> = { png: ['.png'], jpeg: ['.jpg', '.jpeg'], webp: ['.webp'] };

/** Validates (type, content sniffing, malware scan) and stores a product image. Returns its private URL. */
export async function storeProductImage(workspaceId: string, file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  if (file.size > 5 * 1024 * 1024) throw new InventoryError('VALIDATION', 'Image must be 5 MB or smaller.');
  if (!Object.values(EXT).flat().includes(ext)) throw new InventoryError('VALIDATION', 'Invalid image format. Allowed: JPG, PNG, WEBP.');
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!(await scanBuffer(buffer))) throw new InventoryError('VALIDATION', 'Malware detected in uploaded file.');
  const sniffed = sniffAllowedContent(buffer);
  if (!sniffed || !EXT[sniffed] || !EXT[sniffed].includes(ext)) throw new InventoryError('VALIDATION', 'Unsupported or mismatched image content.');
  const dir = buildPrivatePath('products', [workspaceId]);
  await ensureDir(dir);
  const name = uniqueStoredName(`product-${uuidv4()}`, ext);
  await fs.promises.writeFile(path.join(dir, name), buffer, { mode: 0o600 });
  return `/products/${workspaceId}/${name}`;
}

/** Best-effort removal of a stored image. */
export async function removeProductImage(workspaceId: string, url: string | null | undefined) {
  if (!url?.startsWith('/products/')) return;
  const name = url.split('/').pop();
  if (!name) return;
  try {
    await fs.promises.unlink(buildPrivatePath('products', [workspaceId, name]));
  } catch {
    /* already gone */
  }
}
