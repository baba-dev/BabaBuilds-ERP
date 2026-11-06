import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { format } from 'date-fns';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';

const CSV_BATCH_SIZE = 1000;
const MAX_CSV_RECORDS = 120000;

// Reusing the exact same date math to ensure data matches the UI perfectly
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

// Helper to prevent CSV layout breaks if a user typed a comma in a description
const escapeCsv = (str: string | null | undefined) => {
  if (!str) return '""';

  let cleanStr = String(str).replace(/"/g, '""'); // Escape existing quotes

  // --- 🚨 SECURITY PATCH START (CSV Injection Prevention) ---
  // If the string starts with a formula character, prepend a tab to neutralize it
  if (/^[=+\-@\t\r\n]/.test(cleanStr)) {
    cleanStr = `\t${cleanStr}`;
  }
  // --- 🚨 SECURITY PATCH END ---

  return `"${cleanStr}"`; // Wrap in quotes
};

export async function GET(request: Request) {
  try {
    const routeLimit = enforceRouteRateLimit({
      request,
      route: '/api/ca-portal/export/csv',
      scope: 'ca-export-csv',
      max: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!routeLimit.ok) return routeLimit.response;

    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const workspaceId = session.workspaceId;

    // 2. PARSE FY
    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || '25-26';

    let dateFilter: { gte: Date; lte: Date };
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

    // 3. PRECHECK SIZE BOUNDS
    const [invoiceCount, expenseCount, profile] = await Promise.all([
      prisma.invoice.count({ where: { workspaceId, invoiceDate: dateFilter } }),
      prisma.expense.count({ where: { workspaceId, date: dateFilter } }),
      prisma.businessProfile.findUnique({ where: { workspaceId } }),
    ]);

    const totalCount = invoiceCount + expenseCount;
    if (totalCount > MAX_CSV_RECORDS) {
      return NextResponse.json(
        {
          error: 'EXPORT_TOO_LARGE',
          message:
            'Export is too large to generate safely. Please split by smaller FY/date ranges and retry.',
          totals: { invoices: invoiceCount, expenses: expenseCount, records: totalCount },
          limits: { maxRecords: MAX_CSV_RECORDS },
        },
        { status: 413 }
      );
    }

    // 4. STREAM CSV CHUNKS
    const headers = [
      'Date',
      'Transaction Type',
      'Reference / Voucher',
      'Party / Vendor',
      'Category',
      'Description',
      'Amount (INR)',
      'Status',
    ];

    const encoder = new TextEncoder();

    async function* csvLineIterator() {
      yield `${headers.join(',')}\n`;

      let invoiceCursorId: string | undefined;
      let expenseCursorId: string | undefined;
      let invoiceBuffer: Awaited<ReturnType<typeof prisma.invoice.findMany>> = [];
      let expenseBuffer: Awaited<ReturnType<typeof prisma.expense.findMany>> = [];
      let invoiceIndex = 0;
      let expenseIndex = 0;

      while (true) {
        if (invoiceIndex >= invoiceBuffer.length) {
          invoiceBuffer = await prisma.invoice.findMany({
            where: { workspaceId, invoiceDate: dateFilter },
            orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
            take: CSV_BATCH_SIZE,
            ...(invoiceCursorId ? { cursor: { id: invoiceCursorId }, skip: 1 } : {}),
          });
          invoiceCursorId = invoiceBuffer.at(-1)?.id;
          invoiceIndex = 0;
        }

        if (expenseIndex >= expenseBuffer.length) {
          expenseBuffer = await prisma.expense.findMany({
            where: { workspaceId, date: dateFilter },
            orderBy: [{ date: 'asc' }, { id: 'asc' }],
            take: CSV_BATCH_SIZE,
            ...(expenseCursorId ? { cursor: { id: expenseCursorId }, skip: 1 } : {}),
          });
          expenseCursorId = expenseBuffer.at(-1)?.id;
          expenseIndex = 0;
        }

        const nextInvoice = invoiceBuffer[invoiceIndex];
        const nextExpense = expenseBuffer[expenseIndex];

        if (!nextInvoice && !nextExpense) {
          break;
        }

        const takeInvoice =
          !!nextInvoice &&
          (!nextExpense ||
            nextInvoice.invoiceDate.getTime() < nextExpense.date.getTime() ||
            (nextInvoice.invoiceDate.getTime() === nextExpense.date.getTime() &&
              nextInvoice.id.localeCompare(nextExpense.id) <= 0));

        if (takeInvoice && nextInvoice) {
          const line = [
            escapeCsv(format(new Date(nextInvoice.invoiceDate), 'dd-MMM-yyyy')),
            escapeCsv('INCOME'),
            escapeCsv(nextInvoice.invoiceNumber),
            escapeCsv(nextInvoice.clientName),
            escapeCsv(`SAC: ${nextInvoice.sacCode || (profile as any)?.defaultSacCode || '998313'}`),
            escapeCsv(nextInvoice.serviceDescription || 'Services Rendered'),
            nextInvoice.totalAmount.toFixed(2),
            escapeCsv(nextInvoice.status.toUpperCase()),
          ].join(',');
          yield `${line}\n`;
          invoiceIndex += 1;
        } else if (nextExpense) {
          const line = [
            escapeCsv(format(new Date(nextExpense.date), 'dd-MMM-yyyy')),
            escapeCsv('EXPENSE'),
            escapeCsv('-'),
            escapeCsv(nextExpense.vendor),
            escapeCsv(nextExpense.category),
            escapeCsv(nextExpense.description || 'Business Expense'),
            nextExpense.amount.toFixed(2),
            escapeCsv('PAID'),
          ].join(',');
          yield `${line}\n`;
          expenseIndex += 1;
        }
      }
    }

    const iterator = csvLineIterator();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(next.value));
      },
      async cancel() {
        await iterator.return?.();
      },
    });

    // 5. RETURN AS A DOWNLOADABLE FILE
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="BabaBuilds_Ledger_FY${fy}.csv"`,
      },
    });
  } catch (error) {
    console.error('CSV Export Error:', error);
    return new NextResponse('Failed to generate CSV', { status: 500 });
  }
}
