import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { RbacDeniedError, requirePermission } from '@/lib/rbac';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { buildPrivatePath, ensureDir, sanitizeFilename, sniffAllowedContent } from '@/lib/uploads/private-storage';
import { scanBuffer } from '@/lib/security/clamav';
import { classifySharedContent, MAX_SHARED_FILE_COUNT, MAX_SHARED_STAGED_BYTES, MAX_SHARED_SINGLE_FILE_BYTES } from '@/lib/uploads/share-target-staging';

export const runtime = 'nodejs';

type SharedFileMeta = {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  storedName: string;
  relativePath: string;
  publicUrl: string;
};

type SharedImportPayload = {
  id: string;
  workspaceId: string;
  createdAt: string;
  source: 'web-share-target';
  title: string | null;
  text: string | null;
  url: string | null;
  files: SharedFileMeta[];
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = session?.user?.id;

  if (!workspaceId || !userId) {
    return NextResponse.redirect(new URL('/login?callbackUrl=/inbox/import', request.url));
  }

  // Sharing to the inbox is a document upload: protect it before parsing bytes.
  try {
    await requireModule(workspaceId, 'DOCUMENTS');
    await requirePermission(userId, workspaceId, 'documents.upload');
  } catch (error) {
    if (error instanceof ModuleDisabledError || error instanceof RbacDeniedError) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    throw error;
  }
  const limit = await enforceRouteRateLimit({
    request, route: '/share-target', scope: `${workspaceId}:${userId}`,
    max: 60, windowMs: 10 * 60_000,
  });
  if (!limit.ok) return limit.response;

  // Reject advertised oversize bodies before multipart parsing where possible.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SHARED_STAGED_BYTES + 512 * 1024) {
    return new NextResponse('Shared files exceed the staging limit.', { status: 413 });
  }

  const formData = await request.formData();
  const fileEntries = [...formData.values()].filter((value): value is File => value instanceof File && value.size > 0);
  if (fileEntries.length > MAX_SHARED_FILE_COUNT ||
      fileEntries.some((file) => file.size > MAX_SHARED_SINGLE_FILE_BYTES) ||
      fileEntries.reduce((total, file) => total + file.size, 0) > MAX_SHARED_STAGED_BYTES) {
    return new NextResponse('Shared files exceed the staging limit.', { status: 413 });
  }
  const title = formData.get('title');
  const text = formData.get('text');
  const sharedUrl = formData.get('url');

  const uploadId = randomUUID();
  const uploadRoot = buildPrivatePath('share-target', [workspaceId, uploadId]);
  const metadataRoot = path.join(process.cwd(), 'tmp', 'share-target', workspaceId);

  await ensureDir(uploadRoot);
  fs.mkdirSync(metadataRoot, { recursive: true });

  const files: SharedFileMeta[] = [];

  for (const [fieldName, value] of formData.entries()) {
    if (!(value instanceof File) || value.size === 0) continue;

    const bytes = await value.arrayBuffer();
    const buffer = Buffer.from(bytes);
    // Store only a type verified from bytes; never trust an arbitrary extension
    // such as .html from the source application.
    const verified = classifySharedContent(value.type, sniffAllowedContent(buffer), value.name);
    if (!verified) continue;
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) continue;

    const originalBase = sanitizeFilename(path.basename(value.name, path.extname(value.name)));
    const storedName = `${Date.now()}-${randomUUID()}-${originalBase}${verified.extension}`;
    const absolutePath = path.join(uploadRoot, storedName);
    fs.writeFileSync(absolutePath, buffer, { mode: 0o600 });

    const relativePath = `/uploads/share-target/${workspaceId}/${uploadId}/${storedName}`;

    files.push({
      fieldName,
      originalName: value.name,
      mimeType: verified.mimeType,
      size: value.size,
      storedName,
      relativePath,
      publicUrl: relativePath,
    });
  }

  const payload: SharedImportPayload = {
    id: uploadId,
    workspaceId,
    createdAt: new Date().toISOString(),
    source: 'web-share-target',
    title: typeof title === 'string' ? title : null,
    text: typeof text === 'string' ? text : null,
    url: typeof sharedUrl === 'string' ? sharedUrl : null,
    files,
  };

  fs.writeFileSync(path.join(metadataRoot, `${uploadId}.json`), JSON.stringify(payload, null, 2));

  return NextResponse.redirect(new URL(`/inbox/import?shareId=${uploadId}`, request.url));
}
