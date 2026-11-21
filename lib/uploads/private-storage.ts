import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

export type PrivateAssetKind =
  | 'receipts'
  | 'invoices'
  | 'logos'
  | 'signatures'
  | 'products'
  | 'service-hero'
  | 'share-target'
  | 'documents'
  | 'payment-qr';

const DEFAULT_ROOT = path.join(process.cwd(), 'private_uploads');

export function getPrivateUploadsRoot() {
  const configured = process.env.PRIVATE_UPLOADS_DIR?.trim();
  if (configured) return configured;
  return DEFAULT_ROOT;
}

export function assertNoTraversal(segments: string[]) {
  if (segments.some((s) => !s || s === '.' || s.includes('..') || s.includes('/') || s.includes('\\') || /[\u0000-\u001f\u007f]/.test(s))) {
    throw new Error('PATH_TRAVERSAL');
  }
}

export function getKindDir(kind: PrivateAssetKind) {
  return path.join(getPrivateUploadsRoot(), kind);
}

export function buildPrivatePath(kind: PrivateAssetKind, segments: string[]) {
  assertNoTraversal(segments);
  return path.join(getKindDir(kind), ...segments);
}

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}

export function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

function looksLikePng(buf: Buffer) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}
function looksLikeJpeg(buf: Buffer) {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function looksLikeWebp(buf: Buffer) {
  return (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}
function looksLikeGif(buf: Buffer) {
  const head = buf.subarray(0, 6).toString('ascii');
  return head === 'GIF87a' || head === 'GIF89a';
}
function looksLikePdf(buf: Buffer) {
  return buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
}
function looksLikeSvg(buf: Buffer) {
  const prefix = buf.subarray(0, Math.min(buf.length, 512)).toString('utf8').toLowerCase();
  return prefix.includes('<svg') || prefix.includes('<?xml') && prefix.includes('svg');
}

export type AllowedContent =
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'pdf';

export function sniffAllowedContent(buf: Buffer): AllowedContent | null {
  // Explicitly block SVG because it can execute scripts in some contexts.
  if (looksLikeSvg(buf)) return null;
  if (looksLikePng(buf)) return 'png';
  if (looksLikeJpeg(buf)) return 'jpeg';
  if (looksLikeWebp(buf)) return 'webp';
  if (looksLikeGif(buf)) return 'gif';
  if (looksLikePdf(buf)) return 'pdf';
  return null;
}

export function uniqueStoredName(prefix: string, ext: string) {
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}${safeExt}`;
}

export async function servePrivateFile(kind: PrivateAssetKind, pathSegments: string[]) {
  const filePath = buildPrivatePath(kind, pathSegments);
  try {
    const fileBuffer = await fs.readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': inferContentType(filePath),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code === 'ENOENT') {
      return new NextResponse('Not Found', { status: 404 });
    }
    console.error('Failed to read private file', { kind, pathSegments, error: err });
    return new NextResponse('Not Found', { status: 404 });
  }
}

function inferContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

