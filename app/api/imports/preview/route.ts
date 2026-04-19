import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireImportContext } from '@/lib/imports/core/auth';
import { buildPreview } from '@/lib/imports/core/preview';
import { IMPORT_ENTITY_KEYS } from '@/lib/imports/core/types';
import { computeImportDigest } from '@/lib/imports/core/digest';

const Mapping = z.object({ sourceHeader: z.string(), targetField: z.string().nullable(), confidence: z.number(), source: z.enum(['synonym', 'ai', 'manual']), reason: z.string().optional() });
const Body = z.object({
  entity: z.enum(IMPORT_ENTITY_KEYS),
  sourceMode: z.enum(['template', 'arbitrary']),
  fileName: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  mappings: z.array(Mapping),
  aiUsed: z.boolean().default(false),
});

export async function POST(req: Request) {
  try {
    const context = await requireImportContext();
    const body = Body.parse(await req.json());
    const immutableInput = {
      entity: body.entity,
      sourceMode: body.sourceMode,
      fileName: body.fileName,
      headers: body.headers,
      rows: body.rows,
      mappings: body.mappings,
      aiUsed: body.aiUsed,
    };
    const sourceDigest = computeImportDigest(immutableInput);
    const preview = buildPreview(body);

    const run = await prisma.importRun.create({
      data: {
        workspaceId: context.workspaceId,
        entityKey: body.entity,
        fileName: body.fileName,
        sourceMode: body.sourceMode,
        aiUsed: body.aiUsed,
        initiatedByUserId: context.userId,
        status: 'PREVIEW_READY',
        parsedCount: preview.counts.parsed,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: preview.counts.skipped,
        failedCount: preview.counts.errors,
        sourceDigest,
        inputJson: immutableInput as unknown as object,
        previewJson: preview as unknown as object,
      },
      select: { id: true },
    });

    return NextResponse.json({ previewRunId: run.id, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview failed';
    if (message === 'UNAUTHORIZED') return NextResponse.json({ error: message }, { status: 401 });
    if (message === 'FORBIDDEN') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
