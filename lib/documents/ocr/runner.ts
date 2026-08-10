import 'server-only';

import { prisma } from '@/lib/prisma';
import type { OcrJobKind } from '@/lib/documents/ocr/providers';
import { requireOcrCapability } from '@/lib/documents/ocr/providers';

type RunResult =
  | { ok: true; jobId: string; status: 'SUCCEEDED' | 'FAILED'; fieldsWritten: number }
  | { ok: false; jobId: string; error: string };

export async function runNextOcrJob(params: {
  workspaceId?: string;
}): Promise<RunResult | null> {
  // Fail before reading or claiming queued work unless a compiled-in provider is configured.
  const { provider } = requireOcrCapability();

  const job = await prisma.documentOcrJob.findFirst({
    where: {
      status: 'QUEUED',
      provider: provider.key,
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    },
    orderBy: { queuedAt: 'asc' },
    select: {
      id: true,
      workspaceId: true,
      documentId: true,
      documentFileId: true,
      kind: true,
    },
  });

  if (!job) return null;

  const kind = (job.kind as OcrJobKind) || 'GENERIC';

  try {
    await prisma.documentOcrJob.update({
      where: { id: job.id },
      data: {
        status: 'RUNNING',
        provider: provider.key,
        attemptCount: { increment: 1 },
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });

    const file = await prisma.documentFile.findFirst({
      where: { id: job.documentFileId, workspaceId: job.workspaceId },
      select: { storedPath: true, mimeType: true, originalName: true },
    });
    if (!file?.storedPath) {
      throw new Error('MISSING_FILE_POINTER');
    }

    const storedSegments = file.storedPath.replace(/^\/documents\//, '').split('/').filter(Boolean);
    // Lazy import to avoid circular deps
    const { buildPrivatePath } = await import('@/lib/uploads/private-storage');
    const { promises: fs } = await import('fs');
    const absPath = buildPrivatePath('documents', storedSegments);
    const bytes = await fs.readFile(absPath);

    const result = await provider.run({
      kind,
      mimeType: file.mimeType,
      bytes,
      originalName: file.originalName,
    });

    const fieldsWritten = await prisma.$transaction(async (tx) => {
      // Write extracted fields as OCR suggestions (unapproved).
      // We keep this compact: a row per field key (v1). Later revisions can be appended.
      let count = 0;
      for (const f of result.fields) {
        await tx.documentExtractedField.create({
          data: {
            workspaceId: job.workspaceId,
            documentId: job.documentId,
            documentFileId: job.documentFileId,
            fieldKey: f.fieldKey,
            valueText: f.valueText ?? null,
            valueNumber: f.valueNumber ?? null,
            valueDate: f.valueDate ?? null,
            confidence: f.confidence ?? null,
            source: 'OCR',
            isApproved: false,
          },
        });
        count += 1;
      }
      return count;
    });

    await prisma.documentOcrJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
      },
    });

    await prisma.document.update({
      where: { id: job.documentId },
      data: { status: 'READY' },
    });

    await prisma.documentAuditEvent.create({
      data: {
        workspaceId: job.workspaceId,
        documentId: job.documentId,
        documentFileId: job.documentFileId,
        eventType: 'OCR_SUCCEEDED',
        metadata: { provider: provider.key, fieldsWritten },
      },
    });

    return { ok: true, jobId: job.id, status: 'SUCCEEDED', fieldsWritten };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown OCR error';
    await prisma.documentOcrJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorCode: 'OCR_FAILED',
        errorMessage: msg,
        finishedAt: new Date(),
      },
    });
    await prisma.document.update({
      where: { id: job.documentId },
      data: { status: 'FAILED' },
    });
    await prisma.documentAuditEvent.create({
      data: {
        workspaceId: job.workspaceId,
        documentId: job.documentId,
        documentFileId: job.documentFileId,
        eventType: 'OCR_FAILED',
        metadata: { provider: provider.key, error: msg },
      },
    });
    return { ok: true, jobId: job.id, status: 'FAILED', fieldsWritten: 0 };
  }
}

export async function runQueuedOcrJobs(params: { limit: number }) {
  const limit = Math.max(1, Math.min(50, Math.trunc(params.limit)));
  const results: Array<RunResult> = [];

  for (let i = 0; i < limit; i += 1) {
    const r = await runNextOcrJob({});
    if (!r) break;
    results.push(r);
  }

  const succeeded = results.filter((r) => r.ok && r.status === 'SUCCEEDED').length;
  const failed = results.filter((r) => r.ok && r.status === 'FAILED').length;

  return { ran: results.length, succeeded, failed, results };
}
