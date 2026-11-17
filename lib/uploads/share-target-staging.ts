import type { AllowedContent } from '@/lib/uploads/private-storage';

// A shared file must satisfy the same per-file size policy as Document Center.
// Staged files are not yet charged to quota, so cap the aggregate as well.
export const MAX_SHARED_FILE_COUNT = 50;
export const MAX_SHARED_STAGED_BYTES = 50 * 1024 * 1024;
export const MAX_SHARED_SINGLE_FILE_BYTES = 10 * 1024 * 1024;

const TYPES: Record<AllowedContent, { mimeType: string; extension: string }> = {
  png: { mimeType: 'image/png', extension: '.png' },
  jpeg: { mimeType: 'image/jpeg', extension: '.jpg' },
  webp: { mimeType: 'image/webp', extension: '.webp' },
  gif: { mimeType: 'image/gif', extension: '.gif' },
  pdf: { mimeType: 'application/pdf', extension: '.pdf' },
};

/** Use the detected bytes as the authority for the stored extension and MIME. */
export function classifySharedContent(
  claimedMime: string,
  detected: AllowedContent | null,
  originalName: string,
): { mimeType: string; extension: string } | null {
  if (!detected) return null;
  const claimed = claimedMime.toLowerCase();
  if (detected === 'pdf' ? claimed !== 'application/pdf' : !claimed.startsWith('image/')) return null;
  const canonical = TYPES[detected];
  // Preserve a legitimate .jpeg spelling, but never use a mismatched extension.
  if (detected === 'jpeg' && /\.jpeg$/i.test(originalName)) return { ...canonical, extension: '.jpeg' };
  return canonical;
}
