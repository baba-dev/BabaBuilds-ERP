import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { scanBuffer } from '@/lib/security/clamav';

type ImportFlow = 'expenses' | 'invoices' | 'reconciliation';
type ImportStatus = 'IMPORTED' | 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'FAILED';

const supportedTypes: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.csv', '.xlsx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
};

const EXTENSION_TO_FLOW: Record<string, ImportFlow> = {
  '.pdf': 'expenses',
  '.csv': 'reconciliation',
  '.xlsx': 'reconciliation',
  '.png': 'expenses',
  '.jpg': 'expenses',
  '.jpeg': 'expenses',
};

const normalizeExt = (filename: string) => path.extname(filename).toLowerCase();

const logAudit = async (params: {
  workspaceId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  flow?: string;
  status: ImportStatus;
  reason?: string;
}) => {
  await prisma.$executeRaw`
    INSERT INTO "FileImportAuditLog" (
      "id", "workspaceId", "fileName", "mimeType", "fileSizeBytes", "flow", "status", "reason", "createdAt"
    ) VALUES (
      ${randomUUID()},
      ${params.workspaceId},
      ${params.fileName ?? null},
      ${params.mimeType ?? null},
      ${params.fileSize ?? null},
      ${params.flow ?? null},
      ${params.status},
      ${params.reason ?? null},
      CURRENT_TIMESTAMP
    )
  `;
};

const isSupportedFile = (file: File, ext: string) => {
  const allowedExts = Object.values(supportedTypes).flat();
  const mimeKnown = Boolean(file.type && supportedTypes[file.type]);
  return allowedExts.includes(ext) && (mimeKnown || !file.type);
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !(session as any).workspaceId) {
    return apiError(403, 'Permission denied for file import.', 'PERMISSION_DENIED');
  }

  const workspaceId = (session as any).workspaceId as string;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const requestedFlow = formData.get('flow');

    if (!file || file.size === 0) {
      await logAudit({
        workspaceId,
        status: 'FAILED',
        reason: 'Missing file payload',
      });
      return apiError(400, 'No file provided.', 'NO_FILE');
    }

    const ext = normalizeExt(file.name);
    const flow = (requestedFlow && ['expenses', 'invoices', 'reconciliation'].includes(String(requestedFlow))
      ? String(requestedFlow)
      : EXTENSION_TO_FLOW[ext]) as ImportFlow | undefined;

    if (!flow || !isSupportedFile(file, ext)) {
      await logAudit({
        workspaceId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow: flow ?? 'unknown',
        status: 'UNSUPPORTED',
        reason: `Unsupported type (${file.type || 'unknown'}) or extension (${ext || 'none'})`,
      });

      return apiError(
        415,
        'Unsupported file type. Please use PDF, CSV, XLSX, PNG, or JPG.',
        'UNSUPPORTED_FILE',
        {
          supportedExtensions: ['.pdf', '.csv', '.xlsx', '.png', '.jpg'],
        }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const isSafe = await scanBuffer(buffer);
    if (!isSafe) {
      await logAudit({
        workspaceId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow,
        status: 'FAILED',
        reason: 'Malware detected',
      });
      return apiError(400, 'Malware detected in uploaded file.', 'MALWARE_DETECTED');
    }

    if (flow === 'reconciliation' && ext !== '.csv') {
      await logAudit({
        workspaceId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow,
        status: 'UNSUPPORTED',
        reason: 'Reconciliation currently supports CSV content only',
      });

      return apiError(
        415,
        'Reconciliation currently supports .csv files only.',
        'UNSUPPORTED_FOR_FLOW',
        { flow, receivedExtension: ext }
      );
    }

    if (flow === 'expenses') {
      const receiptsDir = path.join(process.cwd(), 'public', 'receipts', workspaceId);
      if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

      const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const uniqueFilename = `${Date.now()}-${safeFilename}`;
      const filepath = path.join(receiptsDir, uniqueFilename);
      fs.writeFileSync(filepath, buffer);

      const importedExpense = await prisma.expense.create({
        data: {
          workspaceId,
          date: new Date(),
          category: 'Imported',
          vendor: 'File Import',
          amount: 0,
          description: `Imported from launched file: ${file.name}`,
          receiptUrl: `/receipts/${workspaceId}/${uniqueFilename}`,
        },
      });

      await logAudit({
        workspaceId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow,
        status: 'IMPORTED',
        reason: `Expense ${importedExpense.id} created`,
      });

      return NextResponse.json({
        success: true,
        flow,
        message: 'File imported into Expenses. Review and update amount/category as needed.',
        redirectTo: '/expenses',
        expenseId: importedExpense.id,
      });
    }

    if (flow === 'reconciliation') {
      await logAudit({
        workspaceId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow,
        status: 'IMPORTED',
        reason: 'Routed to reconciliation upload flow',
      });

      return NextResponse.json({
        success: true,
        flow,
        message: 'CSV file is ready for reconciliation. Continue in Reconciliation.',
        redirectTo: '/reconciliation',
      });
    }

    await logAudit({
      workspaceId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      flow,
      status: 'IMPORTED',
      reason: 'Routed to invoice flow',
    });

    return NextResponse.json({
      success: true,
      flow,
      message: 'File routed to invoice workflow. Continue from Invoice.',
      redirectTo: '/invoice',
    });
  } catch (error) {
    console.error('Open file import failed:', error);
    await logAudit({
      workspaceId,
      status: 'FAILED',
      reason: error instanceof Error ? error.message : 'Unknown import failure',
    });
    return apiError(500, 'Failed to import launched file.', 'FILE_IMPORT_FAILED');
  }
}
