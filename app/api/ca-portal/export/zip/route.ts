import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import JSZip from 'jszip';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

const ZIP_BATCH_SIZE = 500;
const MAX_ZIP_FILES = 12000;
const MAX_ZIP_BYTES = 500 * 1024 * 1024;
const FILE_READ_CHUNK_SIZE = 64 * 1024;

function getFinancialYearDates(fyString: string) {
  if (!/^\d{2}-\d{2}$/.test(fyString)) {
    throw new Error('Invalid FY format');
  }

  const [startYY, endYY] = fyString.split('-').map((part) => parseInt(part, 10));
  const startYear = 2000 + startYY;
  const endYear = 2000 + endYY;

  if (endYear !== startYear + 1) {
    throw new Error('Invalid FY range');
  }

  const startDate = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999));

  return { startDate, endDate };
}

function resolveInvoiceFilePath(workspaceId: string, pdfPath: string) {
  const normalizedRelativePath = pdfPath.replace(/^[/\\]+/, '');
  const parts = normalizedRelativePath.split('/').filter(Boolean);
  if (!(parts[0] === 'invoices' && parts[1] === workspaceId)) {
    return null;
  }

  return buildPrivatePath('invoices', [parts[1], parts.slice(2).join('/')]);
}

function resolveExpenseFilePath(workspaceId: string, receiptUrl: string) {
  const normalized = receiptUrl.replace(/^[/\\]+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!(parts[0] === 'receipts' && parts[1] === workspaceId)) {
    return null;
  }

  return buildPrivatePath('receipts', [parts[1], parts.slice(2).join('/')]);
}

export async function GET(request: Request) {
  try {
    const routeLimit = enforceRouteRateLimit({
      request,
      route: '/api/ca-portal/export/zip',
      scope: 'ca-export-zip',
      max: 4,
      windowMs: 15 * 60 * 1000,
    });
    if (!routeLimit.ok) return routeLimit.response;

    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || '25-26';

    let dateFilter;
    try {
      const { startDate, endDate } = getFinancialYearDates(fy);
      dateFilter = { gte: startDate, lte: endDate };
    } catch {
      return NextResponse.json(
        {
          error: 'INVALID_FINANCIAL_YEAR',
          message: 'Invalid Financial Year format. Use YY-YY consecutive years (example: 25-26).',
        },
        { status: 422 }
      );
    }

    // 2. PRECHECK SIZE BOUNDS
    const [invoiceFileCount, expenseFileCount] = await Promise.all([
      prisma.invoice.count({
        where: { workspaceId, invoiceDate: dateFilter, NOT: { pdfPath: '' } },
      }),
      prisma.expense.count({ where: { workspaceId, date: dateFilter, receiptUrl: { not: null } } }),
    ]);

    const totalCandidateFiles = invoiceFileCount + expenseFileCount;
    if (totalCandidateFiles > MAX_ZIP_FILES) {
      return NextResponse.json(
        {
          error: 'EXPORT_TOO_LARGE',
          message:
            'Evidence export is too large to generate safely. Please split by smaller FY/date ranges and retry.',
          totals: {
            invoiceFiles: invoiceFileCount,
            receiptFiles: expenseFileCount,
            files: totalCandidateFiles,
          },
          limits: { maxFiles: MAX_ZIP_FILES },
        },
        { status: 413 }
      );
    }

    let estimatedBytes = 0;

    let invoiceCursorForSize: string | undefined;
    while (true) {
      const invoices = await prisma.invoice.findMany({
        where: { workspaceId, invoiceDate: dateFilter, NOT: { pdfPath: '' } },
        orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
        take: ZIP_BATCH_SIZE,
        ...(invoiceCursorForSize ? { cursor: { id: invoiceCursorForSize }, skip: 1 } : {}),
      });
      if (invoices.length === 0) break;
      invoiceCursorForSize = invoices.at(-1)?.id;

      for (const inv of invoices) {
        if (!inv.pdfPath) continue;
        const fullPath = resolveInvoiceFilePath(workspaceId, inv.pdfPath);
        if (!fullPath) continue;
        try {
          const stat = await fsPromises.stat(fullPath);
          estimatedBytes += stat.size;
        } catch {
          // ignored: missing/unreadable files are skipped later too
        }
      }

      if (estimatedBytes > MAX_ZIP_BYTES) {
        return NextResponse.json(
          {
            error: 'EXPORT_TOO_LARGE',
            message:
              'Evidence export exceeds size budget. Please split by smaller FY/date ranges and retry.',
            totals: {
              estimatedBytes,
            },
            limits: { maxBytes: MAX_ZIP_BYTES },
          },
          { status: 413 }
        );
      }
    }

    let expenseCursorForSize: string | undefined;
    while (true) {
      const expenses = await prisma.expense.findMany({
        where: { workspaceId, date: dateFilter, receiptUrl: { not: null } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: ZIP_BATCH_SIZE,
        ...(expenseCursorForSize ? { cursor: { id: expenseCursorForSize }, skip: 1 } : {}),
      });
      if (expenses.length === 0) break;
      expenseCursorForSize = expenses.at(-1)?.id;

      for (const exp of expenses) {
        if (!exp.receiptUrl) continue;
        const fullPath = resolveExpenseFilePath(workspaceId, exp.receiptUrl);
        if (!fullPath) continue;
        try {
          const stat = await fsPromises.stat(fullPath);
          estimatedBytes += stat.size;
        } catch {
          // ignored: missing/unreadable files are skipped later too
        }
      }

      if (estimatedBytes > MAX_ZIP_BYTES) {
        return NextResponse.json(
          {
            error: 'EXPORT_TOO_LARGE',
            message:
              'Evidence export exceeds size budget. Please split by smaller FY/date ranges and retry.',
            totals: {
              estimatedBytes,
            },
            limits: { maxBytes: MAX_ZIP_BYTES },
          },
          { status: 413 }
        );
      }
    }

    // 3. INITIALIZE ZIP
    const zip = new JSZip();
    const invoiceFolder = zip.folder('1_Invoices_Income');
    const expenseFolder = zip.folder('2_Expenses_Payables');

    let fileCount = 0;

    // 4. BUNDLE INVOICE PDFs IN DETERMINISTIC BATCHES
    let invoiceCursorId: string | undefined;
    while (true) {
      const invoices = await prisma.invoice.findMany({
        where: { workspaceId, invoiceDate: dateFilter, NOT: { pdfPath: '' } },
        orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
        take: ZIP_BATCH_SIZE,
        ...(invoiceCursorId ? { cursor: { id: invoiceCursorId }, skip: 1 } : {}),
      });

      if (invoices.length === 0) break;
      invoiceCursorId = invoices.at(-1)?.id;

      for (const inv of invoices) {
        if (!inv.pdfPath) continue;

        try {
          const fullPath = resolveInvoiceFilePath(workspaceId, inv.pdfPath);

          if (!fullPath) {
            console.warn(`Skipping unexpected invoice path. invoiceId=${inv.id}, pdfPath=${inv.pdfPath}`);
            continue;
          }

          const readStream = fs.createReadStream(fullPath, {
            highWaterMark: FILE_READ_CHUNK_SIZE,
          });

          // Name the file cleanly for the CA: "INV-24-001_ClientName.pdf"
          const safeClientName = inv.clientName.replace(/[^a-z0-9]/gi, '_');
          const fileName = `${inv.invoiceNumber}_${safeClientName}_${inv.id}.pdf`;

          invoiceFolder?.file(fileName, readStream);
          fileCount++;
        } catch {
          console.warn(`Could not locate file for invoice ${inv.invoiceNumber}`);
          // We silently catch missing files so the rest of the ZIP doesn't crash
        }
      }
    }

    // 5. BUNDLE EXPENSE RECEIPTS IN DETERMINISTIC BATCHES
    let expenseCursorId: string | undefined;
    while (true) {
      const expenses = await prisma.expense.findMany({
        where: { workspaceId, date: dateFilter, receiptUrl: { not: null } },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: ZIP_BATCH_SIZE,
        ...(expenseCursorId ? { cursor: { id: expenseCursorId }, skip: 1 } : {}),
      });

      if (expenses.length === 0) break;
      expenseCursorId = expenses.at(-1)?.id;

      for (const exp of expenses) {
        if (!exp.receiptUrl) continue;

        try {
          const fullPath = resolveExpenseFilePath(workspaceId, exp.receiptUrl);

          if (!fullPath) {
            console.warn(
              `Skipping unexpected receipt path. expenseId=${exp.id}, receiptUrl=${exp.receiptUrl}`
            );
            continue;
          }

          const readStream = fs.createReadStream(fullPath, {
            highWaterMark: FILE_READ_CHUNK_SIZE,
          });

          // Identify the extension (.pdf, .png, .jpg)
          const ext = path.extname(exp.receiptUrl) || '.pdf';
          const safeVendor = exp.vendor.replace(/[^a-z0-9]/gi, '_');

          // Format: "YYYY-MM-DD_VendorName.ext"
          const dateStr = exp.date.toISOString().split('T')[0];
          const fileName = `${dateStr}_${safeVendor}_${exp.id}${ext}`;

          expenseFolder?.file(fileName, readStream);
          fileCount++;
        } catch {
          console.warn(`Could not locate receipt for expense ${exp.id}`);
        }
      }
    }

    // If there is literally nothing to ZIP, return a friendly error
    if (fileCount === 0) {
      return new NextResponse('No physical files found for this Financial Year.', { status: 404 });
    }

    // 6. GENERATE STREAMING ZIP OUTPUT
    const zipStream = zip.generateNodeStream({
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // 7. RETURN DOWNLOAD HEADERS
    return new NextResponse(Readable.toWeb(zipStream as unknown as Readable) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="BabaBuilds_Audit_Evidence_FY${fy}.zip"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('ZIP Export Error:', error);
    return new NextResponse('Failed to generate Evidence ZIP', { status: 500 });
  }
}
