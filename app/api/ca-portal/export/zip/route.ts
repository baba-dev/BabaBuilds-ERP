import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import { buildPrivatePath } from '@/lib/uploads/private-storage';

function getFinancialYearDates(fyString: string) {
  const parts = fyString.split('-');
  if (parts.length !== 2) throw new Error("Invalid FY format");

  const startYear = 2000 + parseInt(parts[0]);
  const endYear = 2000 + parseInt(parts[1]);

  const startDate = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0)); 
  const endDate = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59, 999)); 

  return { startDate, endDate };
}

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || "25-26";
    
    let dateFilter;
    try {
      const { startDate, endDate } = getFinancialYearDates(fy);
      dateFilter = { gte: startDate, lte: endDate };
    } catch (e) {
      return new NextResponse("Invalid Financial Year", { status: 400 });
    }

    // 2. FETCH DATABASE RECORDS
    const [invoices, expenses] = await Promise.all([
      prisma.invoice.findMany({ where: { workspaceId, invoiceDate: dateFilter } }),
      prisma.expense.findMany({ where: { workspaceId, date: dateFilter } })
    ]);

    // 3. INITIALIZE IN-MEMORY ZIP
    const zip = new JSZip();
    const invoiceFolder = zip.folder("1_Invoices_Income");
    const expenseFolder = zip.folder("2_Expenses_Payables");

    let fileCount = 0;

    // 4. BUNDLE INVOICE PDFs
    for (const inv of invoices) {
      if (inv.pdfPath) {
        try {
          const normalizedRelativePath = inv.pdfPath.replace(/^[/\\]+/, '');
          const parts = normalizedRelativePath.split('/').filter(Boolean);
          // Expect: invoices/<workspaceId>/<filename>
          const fileBuffer =
            parts[0] === 'invoices' && parts[1] === workspaceId
              ? await fs.readFile(buildPrivatePath('invoices', [parts[1], parts.slice(2).join('/')]))
              : null;

          if (!fileBuffer) {
            console.warn(`Skipping unexpected invoice path. invoiceId=${inv.id}, pdfPath=${inv.pdfPath}`);
            continue;
          }
          
          // Name the file cleanly for the CA: "INV-24-001_ClientName.pdf"
          const safeClientName = inv.clientName.replace(/[^a-z0-9]/gi, '_');
          const fileName = `${inv.invoiceNumber}_${safeClientName}.pdf`;
          
          invoiceFolder?.file(fileName, fileBuffer);
          fileCount++;
        } catch (err) {
          console.warn(`Could not locate file for invoice ${inv.invoiceNumber}`);
          // We silently catch missing files so the rest of the ZIP doesn't crash
        }
      }
    }

    // 5. BUNDLE EXPENSE RECEIPTS
    for (const exp of expenses) {
      if (exp.receiptUrl) {
        try {
          const normalized = exp.receiptUrl.replace(/^[/\\]+/, '');
          const parts = normalized.split('/').filter(Boolean);
          // Expect: receipts/<workspaceId>/<filename>
          const fileBuffer =
            parts[0] === 'receipts' && parts[1] === workspaceId
              ? await fs.readFile(buildPrivatePath('receipts', [parts[1], parts.slice(2).join('/')]))
              : null;

          if (!fileBuffer) {
            console.warn(`Skipping unexpected receipt path. expenseId=${exp.id}, receiptUrl=${exp.receiptUrl}`);
            continue;
          }
          
          // Identify the extension (.pdf, .png, .jpg)
          const ext = path.extname(exp.receiptUrl) || '.pdf';
          const safeVendor = exp.vendor.replace(/[^a-z0-9]/gi, '_');
          
          // Format: "YYYY-MM-DD_VendorName.ext"
          const dateStr = exp.date.toISOString().split('T')[0];
          const fileName = `${dateStr}_${safeVendor}${ext}`;
          
          expenseFolder?.file(fileName, fileBuffer);
          fileCount++;
        } catch (err) {
          console.warn(`Could not locate receipt for expense ${exp.id}`);
        }
      }
    }

    // If there is literally nothing to ZIP, return a friendly error
    if (fileCount === 0) {
      return new NextResponse("No physical files found for this Financial Year.", { status: 404 });
    }

    // 6. GENERATE THE ZIP STREAM
    const zipBuffer = await zip.generateAsync({ type: "blob" });

    // 7. RETURN DOWNLOAD HEADERS
    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="BabaBuilds_Audit_Evidence_FY${fy}.zip"`,
        'Cache-Control': 'no-cache'
      },
    });

  } catch (error) {
    console.error("ZIP Export Error:", error);
    return new NextResponse("Failed to generate Evidence ZIP", { status: 500 });
  }
}
