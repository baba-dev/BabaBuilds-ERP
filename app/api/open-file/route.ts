import path from 'path';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { scanBuffer } from '@/lib/security/clamav';
import { logActivity } from '@/lib/security/activity-log';
import {
  ensureDir,
  sanitizeFilename,
  sniffAllowedContent,
  uniqueStoredName,
} from '@/lib/uploads/private-storage';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import { requirePermission, RbacDeniedError } from '@/lib/rbac';
import {
  OPEN_FILE_FLOW_PERMISSIONS,
  type ImportFlow,
} from '@/lib/imports/open-file-policy';

type ImportStatus = 'IMPORTED' | 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'FAILED';
type ImportErrorCode =
  | 'PERMISSION_DENIED'
  | 'NO_FILE'
  | 'UNSUPPORTED_FILE'
  | 'UNSUPPORTED_FOR_FLOW'
  | 'FILE_TOO_LARGE'
  | 'MALWARE_DETECTED'
  | 'MALWARE_SCAN_TIMEOUT'
  | 'FILE_IMPORT_FAILED';

const MAX_FILE_SIZE_BYTES = Number(process.env.OPEN_FILE_MAX_SIZE_BYTES ?? 10 * 1024 * 1024);
const MAX_MULTIPART_OVERHEAD_BYTES = Number(process.env.OPEN_FILE_MAX_MULTIPART_OVERHEAD_BYTES ?? 1 * 1024 * 1024);
const MALWARE_SCAN_TIMEOUT_MS = Number(process.env.OPEN_FILE_SCAN_TIMEOUT_MS ?? 60_000);

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
const parseContentLength = (request: Request) => {
  const header = request.headers.get('content-length');
  const parsed = header ? Number(header) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

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

const logAudit = async (params: {
  workspaceId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  flow?: string;
  status: ImportStatus;
  reason?: string;
  request?: Request;
  actorUserId?: string | null;
  actorEmail?: string | null;
}) => {
  await logActivity({
    action: 'OPEN_FILE_IMPORT',
    status: params.status,
    workspaceId: params.workspaceId,
    actor: {
      userId: params.actorUserId,
      email: params.actorEmail,
    },
    entity: {
      type: 'file-import',
    },
    metadata: {
      fileName: params.fileName,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileSize,
      flow: params.flow,
      reason: params.reason,
    },
    request: params.request,
  });
};

const isSupportedFile = (file: File, ext: string) => {
  const allowedExts = Object.values(supportedTypes).flat();
  const mimeKnown = Boolean(file.type && supportedTypes[file.type]);
  return allowedExts.includes(ext) && (mimeKnown || !file.type);
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const actor = session?.user
    ? {
        userId: (session.user as { id?: string | null } | undefined)?.id ?? null,
        email: session.user.email ?? null,
      }
    : undefined;

  if (!session || !workspaceId) {
    return apiError(403, 'Permission denied for file import.', 'PERMISSION_DENIED');
  }

  try {
    const contentLength = parseContentLength(request);
    if (contentLength && contentLength > MAX_FILE_SIZE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
        status: 'FAILED',
        reason: `Payload exceeds limit (${contentLength} > ${MAX_FILE_SIZE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES})`,
      });
      return apiError(
        413,
        `File exceeds maximum upload size of ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
        'FILE_TOO_LARGE' satisfies ImportErrorCode,
        { maxSizeBytes: MAX_FILE_SIZE_BYTES, contentLength }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const requestedFlow = formData.get('flow');

    if (!file || file.size === 0) {
      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
        status: 'FAILED',
        reason: 'Missing file payload',
      });
      return apiError(400, 'No file provided.', 'NO_FILE');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        status: 'FAILED',
        reason: `File size ${file.size} exceeds max ${MAX_FILE_SIZE_BYTES}`,
      });

      return apiError(
        413,
        `File exceeds maximum upload size of ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
        'FILE_TOO_LARGE' satisfies ImportErrorCode,
        { maxSizeBytes: MAX_FILE_SIZE_BYTES, fileSizeBytes: file.size }
      );
    }

    const ext = normalizeExt(file.name);
    const flow = (requestedFlow && ['expenses', 'invoices', 'reconciliation', 'withholding_certificates'].includes(String(requestedFlow))
      ? String(requestedFlow)
      : EXTENSION_TO_FLOW[ext]) as ImportFlow | undefined;

    if (!flow || !isSupportedFile(file, ext)) {
      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
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

    if (!actor?.userId) {
      await logAudit({
        workspaceId,
        request,
        actorEmail: actor?.email,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow,
        status: 'PERMISSION_DENIED',
        reason: 'Missing user context for file import authorization',
      });
      return apiError(403, 'Permission denied for file import.', 'PERMISSION_DENIED');
    }

    for (const permission of OPEN_FILE_FLOW_PERMISSIONS[flow]) {
      try {
        await requirePermission(actor.userId, workspaceId, permission);
      } catch (error) {
        if (!(error instanceof RbacDeniedError)) throw error;

        await logAudit({
          workspaceId,
          request,
          actorUserId: actor.userId,
          actorEmail: actor.email,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          flow,
          status: 'PERMISSION_DENIED',
          reason: `Missing required permission: ${permission}`,
        });
        return apiError(
          403,
          'Permission denied for file import.',
          'PERMISSION_DENIED',
          { flow, requiredPermission: permission },
        );
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const isSafe = await withTimeout(scanBuffer(buffer), MALWARE_SCAN_TIMEOUT_MS);
    if (!isSafe) {
      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
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
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
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


    if (flow === 'withholding_certificates') {
      const guessed = sniffAllowedContent(buffer);
      if (!guessed || (guessed !== 'pdf' && guessed !== 'png' && guessed !== 'jpeg' && guessed !== 'webp')) {
        await logAudit({
          workspaceId,
          request,
          actorUserId: actor?.userId,
          actorEmail: actor?.email,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          flow,
          status: 'UNSUPPORTED',
          reason: 'Withholding certificate content must be pdf/png/jpeg/webp',
        });
        return apiError(415, 'Unsupported withholding certificate content.', 'UNSUPPORTED_FILE');
      }

      const safeBase = sanitizeFilename(path.basename(file.name, path.extname(file.name) || ''));
      const ext = guessed === 'jpeg' ? '.jpg' : guessed === 'pdf' ? '.pdf' : guessed === 'png' ? '.png' : '.webp';
      const storedName = uniqueStoredName(`withholding-${safeBase || 'certificate'}`, ext);
      const filepath = buildPrivatePath('documents', [workspaceId, storedName]);
      await ensureDir(path.dirname(filepath));
      await (await import('fs/promises')).writeFile(filepath, buffer, { mode: 0o600 });

      const grossAmountRaw = Number(formData.get('grossAmount') ?? 0);
      const creditedAmountRaw = Number(formData.get('creditedAmount') ?? 0);
      const withheldAmountRaw = Number(formData.get('withheldAmount') ?? creditedAmountRaw);
      const certificateNumber = String(formData.get('certificateNumber') ?? '').trim() || null;
      const counterpartyName = String(formData.get('counterpartyName') ?? '').trim() || null;
      const returnPeriodKey = String(formData.get('returnPeriodKey') ?? '').trim() || null;
      const certificateIssuedAtRaw = String(formData.get('certificateIssuedAt') ?? '').trim();
      const certificateIssuedAt = certificateIssuedAtRaw ? new Date(certificateIssuedAtRaw) : null;

      const importedCredit = await prisma.$transaction(async (tx) => {
        const document = await tx.document.create({
          data: {
            workspaceId,
            title: file.name,
            category: 'WITHHOLDING_CERTIFICATE',
            scope: 'COMPLIANCE',
            status: 'READY',
            source: 'upload_center',
            uploadedByUserId: actor?.userId ?? null,
          },
        });

        await tx.documentFile.create({
          data: {
            documentId: document.id,
            workspaceId,
            isCurrent: true,
            mimeType: file.type || 'application/octet-stream',
            originalName: file.name,
            storedPath: `/documents/${workspaceId}/${storedName}`,
            byteSize: file.size,
          },
        });

        const creditEvent = await tx.taxCreditEvent.create({
          data: {
            workspaceId,
            sourceType: 'WITHHOLDING_CERTIFICATE',
            sourceId: document.id,
            documentId: document.id,
            creditType: 'WITHHOLDING',
            counterpartyName,
            certificateNumber,
            grossAmount: Number.isFinite(grossAmountRaw) && grossAmountRaw > 0 ? grossAmountRaw : null,
            creditedAmount: Number.isFinite(creditedAmountRaw) && creditedAmountRaw > 0 ? creditedAmountRaw : 0,
            withheldAmount: Number.isFinite(withheldAmountRaw) && withheldAmountRaw > 0 ? withheldAmountRaw : null,
            certificateIssuedAt: certificateIssuedAt && !Number.isNaN(certificateIssuedAt.getTime()) ? certificateIssuedAt : null,
            returnPeriodKey,
            createdByUserId: actor?.userId ?? null,
          },
        });

        await tx.taxCreditLedgerEntry.create({
          data: {
            workspaceId,
            taxCreditEventId: creditEvent.id,
            entryType: 'CREDIT',
            amount: Number.isFinite(creditedAmountRaw) && creditedAmountRaw > 0 ? creditedAmountRaw : 0,
            entryDate: certificateIssuedAt && !Number.isNaN(certificateIssuedAt.getTime()) ? certificateIssuedAt : new Date(),
            returnPeriodKey,
            createdByUserId: actor?.userId ?? null,
            notes: 'Auto-posted from withholding certificate ingestion',
          },
        });

        return { documentId: document.id, creditEventId: creditEvent.id };
      });

      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        flow,
        status: 'IMPORTED',
        reason: `Tax credit posted from certificate ${importedCredit.creditEventId}`,
      });

      return NextResponse.json({
        success: true,
        flow,
        message: 'Withholding certificate ingested and credit posted to ledger.',
        redirectTo: '/ca-portal',
        documentId: importedCredit.documentId,
        taxCreditEventId: importedCredit.creditEventId,
      });
    }

    if (flow === 'expenses') {
      const guessed = sniffAllowedContent(buffer);
      if (!guessed || (guessed !== 'pdf' && guessed !== 'png' && guessed !== 'jpeg' && guessed !== 'webp')) {
        await logAudit({
          workspaceId,
          request,
          actorUserId: actor?.userId,
          actorEmail: actor?.email,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          flow,
          status: 'UNSUPPORTED',
          reason: 'Receipt content did not match supported formats (pdf/png/jpeg/webp)',
        });
        return apiError(415, 'Unsupported receipt content.', 'UNSUPPORTED_FILE');
      }

      const safeBase = sanitizeFilename(path.basename(file.name, path.extname(file.name) || ''));
      const ext = guessed === 'jpeg' ? '.jpg' : guessed === 'pdf' ? '.pdf' : guessed === 'png' ? '.png' : '.webp';
      const storedName = uniqueStoredName(`receipt-${safeBase || 'upload'}`, ext);
      const filepath = buildPrivatePath('receipts', [workspaceId, storedName]);
      await ensureDir(path.dirname(filepath));
      await (await import('fs/promises')).writeFile(filepath, buffer, { mode: 0o600 });

      const importedExpense = await prisma.expense.create({
        data: {
          workspaceId,
          date: new Date(),
          category: 'Imported',
          vendor: 'File Import',
          amount: 0,
          description: `Imported from launched file: ${file.name}`,
          receiptUrl: `/receipts/${workspaceId}/${storedName}`,
        },
      });

      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
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
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
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
      request,
      actorUserId: actor?.userId,
      actorEmail: actor?.email,
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
      message: 'File routed to invoice workflow. Continue from Invoices & Earnings.',
      redirectTo: '/income',
    });
  } catch (error) {
    console.error('Open file import failed:', error);
    const isScanTimeout = error instanceof Error && error.message === 'MALWARE_SCAN_TIMEOUT';

    if (isScanTimeout) {
      await logAudit({
        workspaceId,
        request,
        actorUserId: actor?.userId,
        actorEmail: actor?.email,
        status: 'FAILED',
        reason: `Malware scan timed out after ${MALWARE_SCAN_TIMEOUT_MS}ms`,
      });

      return apiError(
        504,
        'File security scan timed out. Please retry shortly.',
        'MALWARE_SCAN_TIMEOUT' satisfies ImportErrorCode,
        { timeoutMs: MALWARE_SCAN_TIMEOUT_MS }
      );
    }

    await logAudit({
      workspaceId,
      request,
      actorUserId: actor?.userId,
      actorEmail: actor?.email,
      status: 'FAILED',
      reason: error instanceof Error ? error.message : 'Unknown import failure',
    });
    return apiError(500, 'Failed to import launched file.', 'FILE_IMPORT_FAILED' satisfies ImportErrorCode);
  }
}
