import crypto from 'crypto';
import path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { requirePermission } from '@/lib/rbac';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { scanBuffer } from '@/lib/security/clamav';
import { ensureDir, sanitizeFilename } from '@/lib/uploads/private-storage';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import { logActivity } from '@/lib/security/activity-log';
import {
  classifyMimeCategory,
  isAllowedDocumentMime,
  maxPerFileBytesForMime,
  prettyBytes,
} from '@/lib/documents/policy';
import {
  canWorkspaceUploadBytes,
  consumeWorkspaceDocumentBytes,
  getWorkspaceQuotaSnapshot,
} from '@/lib/documents/quota';
import { promises as fs } from 'fs';
import type { DocumentCategory, DocumentScope } from '@/lib/documents/policy';
import { sniffAllowedContent } from '@/lib/uploads/private-storage';
import {
  buildOcrEnqueuePlan,
  getOcrCapability,
  toOcrCapabilityResponse,
} from '@/lib/documents/ocr/providers';

const MALWARE_SCAN_TIMEOUT_MS = Number(process.env.DOCUMENTS_UPLOAD_SCAN_TIMEOUT_MS ?? 60_000);

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('MALWARE_SCAN_TIMEOUT')), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!session || !workspaceId || !userId) {
    return apiError(401, 'Unauthorized', 'UNAUTHORIZED');
  }

  try {
    await requireModule(workspaceId, 'DOCUMENTS');
  } catch (e) {
    if (e instanceof ModuleDisabledError) {
      return apiError(403, 'Document Vault is disabled for this workspace.', 'MODULE_DISABLED');
    }
    throw e;
  }

  try {
    await requirePermission(userId, workspaceId, 'documents.upload');
  } catch (e) {
    return apiError(403, 'Permission denied.', 'RBAC_DENIED');
  }

  const ocrCapability = getOcrCapability();
  const ocrCapabilityResponse = toOcrCapabilityResponse(ocrCapability);

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const category = (formData.get('category') as string | null) ?? 'GENERAL_DOCUMENT';
  const scope = (formData.get('scope') as string | null) ?? 'WORKSPACE_BUSINESS';
  const titleRaw = (formData.get('title') as string | null) ?? null;

  if (!file || file.size === 0) {
    return apiError(400, 'No file provided.', 'NO_FILE');
  }

  const mimeType = file.type || 'application/octet-stream';
  if (!isAllowedDocumentMime(mimeType)) {
    await logActivity({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      status: 'FAILURE',
      workspaceId,
      actor: { userId, email: session.user?.email ?? null },
      entity: { type: 'document' },
      metadata: { reason: 'UNSUPPORTED_MIME', mimeType, fileName: file.name, fileSizeBytes: file.size },
      request,
    });
    return apiError(
      415,
      'Unsupported file type. Allowed: PDF, PNG, JPG/JPEG, WEBP.',
      'DOCS_UNSUPPORTED_MIME',
      { allowed: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'] },
    );
  }

  const perFileLimit = maxPerFileBytesForMime(mimeType);
  if (file.size > perFileLimit) {
    await logActivity({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      status: 'FAILURE',
      workspaceId,
      actor: { userId, email: session.user?.email ?? null },
      entity: { type: 'document' },
      metadata: {
        reason: 'FILE_TOO_LARGE',
        mimeType,
        fileName: file.name,
        fileSizeBytes: file.size,
        maxSizeBytes: perFileLimit,
      },
      request,
    });
    return apiError(
      413,
      `File is too large. Max for ${classifyMimeCategory(mimeType)} is ${prettyBytes(perFileLimit)}.`,
      'DOCS_FILE_TOO_LARGE',
      { maxSizeBytes: perFileLimit, fileSizeBytes: file.size },
    );
  }

  // Quota check (best effort; enforced again transactionally on consume)
  const quota = await canWorkspaceUploadBytes({ workspaceId, incomingBytes: file.size });
  if (!quota.ok) {
    await logActivity({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      status: 'FAILURE',
      workspaceId,
      actor: { userId, email: session.user?.email ?? null },
      entity: { type: 'document' },
      metadata: {
        reason: 'QUOTA_EXCEEDED',
        bytesUsedTotal: quota.snapshot.bytesUsedTotal,
        bytesCap: quota.snapshot.bytesCapTotal,
        fileSizeBytes: file.size,
      },
      request,
    });
    return apiError(
      403,
      'Workspace document storage is full. Upgrade to add more storage.',
      'DOCS_QUOTA_EXCEEDED',
      {
        requiresUpgrade: true,
        bytesUsedTotal: quota.snapshot.bytesUsedTotal,
        bytesCap: quota.snapshot.bytesCapTotal,
      },
    );
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Content sniffing (extra safety; reuse existing recognizers)
  const sniffed = sniffAllowedContent(buffer);
  const sniffOk =
    (mimeType === 'application/pdf' && sniffed === 'pdf') ||
    (mimeType === 'image/png' && sniffed === 'png') ||
    ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && sniffed === 'jpeg') ||
    (mimeType === 'image/webp' && sniffed === 'webp');
  if (!sniffOk) {
    await logActivity({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      status: 'FAILURE',
      workspaceId,
      actor: { userId, email: session.user?.email ?? null },
      entity: { type: 'document' },
      metadata: { reason: 'SNIFF_MISMATCH', mimeType, sniffed, fileName: file.name, fileSizeBytes: file.size },
      request,
    });
    return apiError(415, 'Unsupported or invalid file content.', 'DOCS_UNSUPPORTED_MIME');
  }

  const isSafe = await withTimeout(scanBuffer(buffer), MALWARE_SCAN_TIMEOUT_MS).catch(() => false);
  if (!isSafe) {
    await logActivity({
      action: 'DOCUMENT_UPLOAD_REJECTED',
      status: 'FAILURE',
      workspaceId,
      actor: { userId, email: session.user?.email ?? null },
      entity: { type: 'document' },
      metadata: { reason: 'MALWARE_DETECTED_OR_TIMEOUT', mimeType, fileName: file.name, fileSizeBytes: file.size },
      request,
    });
    return apiError(400, 'File failed security scan. Please upload a different file.', 'MALWARE_DETECTED');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Create Document + DocumentFile and consume quota transactionally.
  // If quota consumption fails, we do not write file bytes.
  const created = await prisma.$transaction(async (tx) => {
    // Re-check quota transactionally (prevent race)
    const snapshot = await getWorkspaceQuotaSnapshot(workspaceId);
    if (snapshot.bytesCapTotal !== Infinity && snapshot.bytesUsedTotal + file.size > snapshot.bytesCapTotal) {
      return apiError(
        403,
        'Workspace document storage is full. Upgrade to add more storage.',
        'DOCS_QUOTA_EXCEEDED',
        {
          requiresUpgrade: true,
          bytesUsedTotal: snapshot.bytesUsedTotal,
          bytesCap: snapshot.bytesCapTotal,
        },
      );
    }

    const doc = await tx.document.create({
      data: {
        workspaceId,
        title: (titleRaw?.trim() || sanitizeFilename(path.basename(file.name, path.extname(file.name))) || 'Document').slice(
          0,
          140,
        ),
        category: category as DocumentCategory,
        scope: scope as DocumentScope,
        status: 'INBOX',
        source: 'upload_center',
        uploadedByUserId: userId,
      },
      select: { id: true },
    });

    // consume quota
    await consumeWorkspaceDocumentBytes(tx, { workspaceId, addBytes: file.size });

    const safeOriginalName = sanitizeFilename(file.name);
    const ext = path.extname(safeOriginalName).toLowerCase() || (mimeType === 'application/pdf' ? '.pdf' : '');
    const versionId = crypto.randomUUID();
    const storedName = `${versionId}${ext}`;
    const storedSegments = [workspaceId, doc.id, storedName];
    const storedPath = `/documents/${storedSegments.join('/')}`;

    const fileRow = await tx.documentFile.create({
      data: {
        workspaceId,
        documentId: doc.id,
        isCurrent: true,
        mimeType,
        originalName: safeOriginalName,
        storedPath,
        sha256,
        byteSize: file.size,
      },
      select: { id: true, storedPath: true },
    });

    await tx.documentAuditEvent.create({
      data: {
        workspaceId,
        documentId: doc.id,
        documentFileId: fileRow.id,
        eventType: 'UPLOAD_ACCEPTED',
        actorUserId: userId,
        metadata: {
          mimeType,
          fileName: safeOriginalName,
          fileSizeBytes: file.size,
          ocrCapability: ocrCapabilityResponse,
        },
      },
    });

    const ocrPlan = buildOcrEnqueuePlan(
      ocrCapability,
      mimeType === 'application/pdf' ? 'GENERIC' : 'RECEIPT',
    );
    const ocrJob = ocrPlan
      ? await tx.documentOcrJob.create({
          data: {
            workspaceId,
            documentId: doc.id,
            documentFileId: fileRow.id,
            ...ocrPlan,
          },
          select: { id: true },
        })
      : null;

    return {
      documentId: doc.id,
      documentFileId: fileRow.id,
      storedSegments,
      storedPath,
      ocrJobId: ocrJob?.id ?? null,
    };
  });

  if (created instanceof NextResponse) return created;

  // Write bytes after DB commit
  const absPath = buildPrivatePath('documents', created.storedSegments);
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, buffer, { mode: 0o600 });

  // Optional AI Analysis
  const aiAnalyze = formData.get('aiAnalyze') === 'true';
  let aiSummary = null;
  let aiMeta = null;
  let aiTitle = null;

  if (aiAnalyze) {
    try {
      let text = '';
      if (mimeType === 'application/pdf') {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const pdfData = await parser.getText();
        text = pdfData.text;
        await parser.destroy();
      } else {
        text = buffer.toString('utf8'); // Basic fallback
      }

      if (text.trim().length > 0) {
        const { analyzeDocumentWithGroq } = await import('@/lib/ai/groq-analyzer');
        const analysis = await analyzeDocumentWithGroq(text);
        if (analysis) {
          aiTitle = analysis.title;
          aiSummary = analysis.summary;
          aiMeta = analysis.meta;

          await prisma.document.update({
            where: { id: created.documentId },
            data: {
              title: aiTitle,
              aiSummary,
              aiMeta: aiMeta as any,
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to run AI analysis:', error);
    }
  }

  await logActivity({
    action: 'DOCUMENT_UPLOADED',
    status: 'SUCCESS',
    workspaceId,
    actor: { userId, email: session.user?.email ?? null },
    entity: { type: 'document', id: created.documentId },
    metadata: {
      documentId: created.documentId,
      documentFileId: created.documentFileId,
      mimeType,
      byteSize: file.size,
      aiAnalyzed: aiAnalyze,
      ocrCapability: ocrCapabilityResponse,
      ocrJobId: created.ocrJobId,
    },
    request,
  });

  return NextResponse.json({
    ok: true,
    documentId: created.documentId,
    filePath: created.storedPath,
    ocrJobId: created.ocrJobId,
    capabilities: { ocr: ocrCapabilityResponse },
  });
}

