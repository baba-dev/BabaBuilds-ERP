import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { requirePermission, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { isTaxImportTemplateType, TAX_IMPORT_TEMPLATES, type TaxImportTemplateType } from '@/lib/tax/import-templates';

type ImportRowPayload = {
  rowNumber?: number;
  rawData?: Record<string, unknown>;
};

function validateRow(templateType: TaxImportTemplateType, row: ImportRowPayload) {
  const columns = TAX_IMPORT_TEMPLATES[templateType].columns;
  const rawData = row.rawData ?? {};
  const missing = columns.filter((col) => {
    const value = rawData[col];
    return value === null || value === undefined || String(value).trim() === '';
  });

  if (missing.length > 0) {
    return {
      status: 'ERROR',
      code: 'VALIDATION_REQUIRED_FIELD_MISSING',
      message: `Missing required columns: ${missing.join(', ')}`,
      fieldName: missing[0],
      normalizedData: null,
    };
  }

  const normalizedData = Object.fromEntries(
    Object.entries(rawData).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]),
  );

  return {
    status: 'SUCCESS',
    code: null,
    message: 'Row accepted.',
    fieldName: null,
    normalizedData,
  };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!workspaceId || !userId) return apiError(401, 'Unauthorized', 'UNAUTHORIZED');

  try {
    await requirePermission(userId, workspaceId, 'tax.manage');
  } catch (error) {
    if (error instanceof RbacDeniedError) return rbacDeniedResponse(error);
    throw error;
  }

  const body = (await req.json().catch(() => null)) as
    | {
        templateType?: string;
        sourceName?: string;
        rows?: ImportRowPayload[];
      }
    | null;

  const templateType = body?.templateType;
  const sourceName = body?.sourceName?.trim() || null;
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  if (!isTaxImportTemplateType(templateType)) {
    return apiError(400, 'Invalid templateType', 'INVALID_INPUT');
  }

  if (rows.length === 0) {
    return apiError(400, 'At least one row is required', 'INVALID_INPUT');
  }

  const diagnostics = rows.map((row, index) => {
    const rowNumber = Number.isFinite(row.rowNumber) && (row.rowNumber as number) > 0 ? Number(row.rowNumber) : index + 1;
    const result = validateRow(templateType, row);
    return {
      rowNumber,
      rawData: row.rawData ?? {},
      ...result,
    };
  });

  const successCount = diagnostics.filter((d) => d.status === 'SUCCESS').length;
  const warningCount = diagnostics.filter((d) => d.status === 'WARNING').length;
  const errorCount = diagnostics.filter((d) => d.status === 'ERROR').length;

  const status = errorCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';

  const batch = await prisma.taxImportBatch.create({
    data: {
      workspaceId,
      templateType,
      sourceName,
      status,
      submittedByUserId: userId,
      rowCount: diagnostics.length,
      successCount,
      warningCount,
      errorCount,
      metadata: {
        templateColumns: TAX_IMPORT_TEMPLATES[templateType].columns,
      },
    },
    select: {
      id: true,
      templateType: true,
      status: true,
      rowCount: true,
      successCount: true,
      warningCount: true,
      errorCount: true,
      createdAt: true,
    },
  });

  await prisma.taxImportRow.createMany({
    data: diagnostics.map((diag) => ({
      workspaceId,
      batchId: batch.id,
      rowNumber: diag.rowNumber,
      status: diag.status,
      code: diag.code,
      message: diag.message,
      fieldName: diag.fieldName,
      rawData: diag.rawData as Prisma.InputJsonValue,
      normalizedData:
        diag.normalizedData === null
          ? Prisma.JsonNull
          : (diag.normalizedData as Prisma.InputJsonValue),
    })),
  });

  return NextResponse.json({
    ok: true,
    acknowledgment: {
      message: 'Tax import diagnostics persisted.',
      batch,
      acknowledgedAt: new Date().toISOString(),
    },
    diagnostics,
  });
}
