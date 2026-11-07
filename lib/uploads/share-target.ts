import 'server-only';

import { promises as fs } from 'fs';
import path from 'path';

export type SharedImportFile = {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  publicUrl: string;
  /** Present on legacy payloads written before `publicUrl` was protected. */
  relativePath?: string;
};

export type SharedImportPayload = {
  id: string;
  workspaceId?: string;
  createdAt: string;
  source: 'web-share-target';
  title: string | null;
  text: string | null;
  url: string | null;
  files: SharedImportFile[];
};

const SHARE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROTECTED_PREFIX = '/uploads/share-target/';

/** Share ids are server-generated UUIDs; anything else never touches the filesystem. */
export function isValidShareId(value: unknown): value is string {
  return typeof value === 'string' && SHARE_ID_PATTERN.test(value);
}

/** Only http(s) links may be rendered as clickable source URLs (blocks javascript:/data: schemes). */
export function toSafeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function metadataPath(workspaceId: string, shareId: string): string | null {
  if (!isValidShareId(shareId) || workspaceId.length === 0) return null;
  const root = path.resolve(process.cwd(), 'tmp', 'share-target');
  const resolved = path.resolve(root, workspaceId, `${shareId}.json`);
  // Defense in depth: the workspace id comes from the session, but never trust path joins.
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

function normalizeFiles(files: unknown): SharedImportFile[] {
  if (!Array.isArray(files)) return [];
  return files.flatMap((file: SharedImportFile) => {
    if (!file || typeof file !== 'object') return [];
    const url = typeof file.publicUrl === 'string' ? file.publicUrl : '';
    // Previews must always go through the protected route, even for older payloads.
    if (url.startsWith(PROTECTED_PREFIX)) return [file];
    if (typeof file.relativePath === 'string' && file.relativePath.startsWith(PROTECTED_PREFIX)) {
      return [{ ...file, publicUrl: file.relativePath }];
    }
    return [file];
  });
}

/**
 * Loads a share-target payload for the given workspace. Returns null for malformed ids,
 * missing files, unreadable JSON, or payloads that belong to a different workspace.
 */
export async function loadSharedPayload(
  workspaceId: string,
  shareId: string,
): Promise<SharedImportPayload | null> {
  const payloadPath = metadataPath(workspaceId, shareId);
  if (!payloadPath) return null;

  try {
    const parsed = JSON.parse(await fs.readFile(payloadPath, 'utf-8')) as SharedImportPayload;
    if (parsed.workspaceId && parsed.workspaceId !== workspaceId) return null;
    return { ...parsed, files: normalizeFiles(parsed.files) };
  } catch {
    return null;
  }
}
