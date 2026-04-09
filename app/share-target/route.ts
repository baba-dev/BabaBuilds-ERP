import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { authOptions } from '@/lib/auth';

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

const sanitizeFilename = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;

  if (!workspaceId) {
    return NextResponse.redirect(new URL('/login?callbackUrl=/inbox/import', request.url));
  }

  const formData = await request.formData();
  const title = formData.get('title');
  const text = formData.get('text');
  const sharedUrl = formData.get('url');

  const uploadId = randomUUID();
  const uploadRoot = path.join(process.cwd(), 'public', 'uploads', 'share-target', workspaceId, uploadId);
  const metadataRoot = path.join(process.cwd(), 'tmp', 'share-target', workspaceId);

  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(metadataRoot, { recursive: true });

  const files: SharedFileMeta[] = [];

  for (const [fieldName, value] of formData.entries()) {
    if (!(value instanceof File) || value.size === 0) continue;

    const mimeType = value.type || 'application/octet-stream';
    const isImage = mimeType.startsWith('image/');
    const isPdf = mimeType === 'application/pdf';

    if (!isImage && !isPdf) continue;

    const ext = path.extname(value.name) || (isPdf ? '.pdf' : '.bin');
    const storedName = `${Date.now()}-${randomUUID()}-${sanitizeFilename(path.basename(value.name, ext))}${ext.toLowerCase()}`;
    const absolutePath = path.join(uploadRoot, storedName);
    const bytes = await value.arrayBuffer();

    fs.writeFileSync(absolutePath, Buffer.from(bytes));

    const relativePath = `/uploads/share-target/${workspaceId}/${uploadId}/${storedName}`;

    files.push({
      fieldName,
      originalName: value.name,
      mimeType,
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
