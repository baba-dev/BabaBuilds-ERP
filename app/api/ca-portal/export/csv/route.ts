import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { format } from 'date-fns';

const CSV_BATCH_SIZE = 1000;
const MAX_CSV_RECORDS = 120000;

// Reusing the exact same date math to ensure data matches the UI perfectly
function getFinancialYearDates(fyString: string) {
  const parts = fyString.split('-');
  if (parts.length !== 2) throw new Error('Invalid FY format');

  const startYear = 2000 + parseInt(parts[0]);
  const endYear = 2000 + parseInt(parts[1]);

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

type LedgerRow = {
  date: Date;
  type: 'INCOME' | 'EXPENSE';
  reference: string;
  party: string;
  category: string;
  description: string;
  amount: number;
  status: string;
};

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. PARSE FY
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
          message: 'Invalid Financial Year format. Use YY-YY (example: 25-26).',
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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const writeRow = (row: LedgerRow) => {
          const line = [
            escapeCsv(format(new Date(row.date), 'dd-MMM-yyyy')),
            escapeCsv(row.type),
            escapeCsv(row.reference),
            escapeCsv(row.party),
            escapeCsv(row.category),
            escapeCsv(row.description),
            row.amount.toFixed(2),
            escapeCsv(row.status),
          ].join(',');
          controller.enqueue(encoder.encode(`${line}\n`));
        };

        controller.enqueue(encoder.encode(`${headers.join(',')}\n`));

        let invoiceCursorId: string | undefined;
        let expenseCursorId: string | undefined;
        let invoiceBuffer: Awaited<ReturnType<typeof prisma.invoice.findMany>> = [];
        let expenseBuffer: Awaited<ReturnType<typeof prisma.expense.findMany>> = [];

        while (true) {
          if (invoiceBuffer.length === 0) {
            invoiceBuffer = await prisma.invoice.findMany({
              where: { workspaceId, invoiceDate: dateFilter },
              orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
              take: CSV_BATCH_SIZE,
              ...(invoiceCursorId ? { cursor: { id: invoiceCursorId }, skip: 1 } : {}),
            });
            invoiceCursorId = invoiceBuffer.at(-1)?.id;
          }

          if (expenseBuffer.length === 0) {
            expenseBuffer = await prisma.expense.findMany({
              where: { workspaceId, date: dateFilter },
              orderBy: [{ date: 'asc' }, { id: 'asc' }],
              take: CSV_BATCH_SIZE,
              ...(expenseCursorId ? { cursor: { id: expenseCursorId }, skip: 1 } : {}),
            });
            expenseCursorId = expenseBuffer.at(-1)?.id;
          }

          const nextInvoice = invoiceBuffer[0];
          const nextExpense = expenseBuffer[0];

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
            writeRow({
              date: nextInvoice.invoiceDate,
              type: 'INCOME',
              reference: nextInvoice.invoiceNumber,
              party: nextInvoice.clientName,
              category: `SAC: ${nextInvoice.sacCode || (profile as any)?.defaultSacCode || '998313'}`,
              description: nextInvoice.serviceDescription || 'Services Rendered',
              amount: Number(nextInvoice.totalAmount),
              status: nextInvoice.status.toUpperCase(),
            });
            invoiceBuffer.shift();
          } else if (nextExpense) {
            writeRow({
              date: nextExpense.date,
              type: 'EXPENSE',
              reference: '-',
              party: nextExpense.vendor,
              category: nextExpense.category,
              description: nextExpense.description || 'Business Expense',
              amount: Number(nextExpense.amount),
              status: 'PAID',
            });
            expenseBuffer.shift();
          }
        }

        controller.close();
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
