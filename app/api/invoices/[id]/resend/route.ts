import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { sendEmail } from '@/lib/mailer';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    
    // Resolve dynamic params (Next.js 15 strict mode safe)
    const resolvedParams = await params;
    const invoiceId = resolvedParams.id;

    // 2. FETCH INVOICE & CLIENT DATA (Workspace Scoped)
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId, workspaceId: workspaceId },
      include: { client: true }
    });

    if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    if (!invoice.client || !invoice.client.email) {
      return NextResponse.json({ error: 'Client has no email address on file.' }, { status: 400 });
    }

    // 3. FETCH SMTP PROFILE (Workspace Scoped)
    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId: workspaceId } 
    });

    if (!profile || !profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
      return NextResponse.json({ error: 'SMTP Server not configured in Business Settings.' }, { status: 400 });
    }

    // 4. LOCATE THE EXISTING PDF
    const relativePdfPath = invoice.pdfPath.startsWith('/') 
      ? invoice.pdfPath.substring(1) 
      : invoice.pdfPath;
    const absolutePdfPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePdfPath);
    if (!fs.existsSync(absolutePdfPath)) {
      return NextResponse.json({ error: 'The original PDF file could not be found on the server.' }, { status: 404 });
    }

    // 5. TRANSMIT EMAIL (Security: resolveSafeIp is internal to sendEmail)
    const billedAmount = (invoice as any).grandTotal || invoice.totalAmount;
    const formattedTotal = billedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pdfFilename = invoice.pdfPath.split('/').pop() || `${invoice.invoiceNumber.replace(/\//g, '_')}.pdf`;

    await sendEmail({
      profile,
      to: invoice.client.email,
      subject: `Invoice ${invoice.invoiceNumber} from ${profile.companyName}`,
      text: `Dear ${invoice.client.name},\n\nPlease find attached the invoice ${invoice.invoiceNumber} for the billing month of ${invoice.billingMonth}.\n\nTotal Amount Billed: INR ${formattedTotal}\n\nThank you for your business.\n\nBest Regards,\n${profile.companyName}`,
      attachments: [
        {
          filename: pdfFilename,
          path: absolutePdfPath,
        }
      ]
    });

    return NextResponse.json({ success: true, message: 'Email resent successfully.' });

  } catch (error: any) {
    console.error("Resend Email Error:", error);
    return NextResponse.json({ error: error.message || 'Failed to resend the invoice email.' }, { status: 500 });
  }
}

