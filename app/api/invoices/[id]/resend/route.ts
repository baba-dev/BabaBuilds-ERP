import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { promisify } from 'util';
const lookupAsync = promisify(dns.lookup);

async function resolveSafeIp(host: string): Promise<string | null> {
  try {
    if (host.toLowerCase() === 'localhost') return null;

    const { address } = await lookupAsync(host);

    // Block IPv4 loopback, private networks, and link-local (metadata endpoints)
    if (address.startsWith('127.')) return null; 
    if (address.startsWith('10.')) return null; 
    if (address.startsWith('192.168.')) return null; 
    if (address.startsWith('169.254.')) return null; 
    if (address === '0.0.0.0') return null;

    // Block Class B private (172.16.0.0 - 172.31.255.255)
    if (address.startsWith('172.')) {
      const secondOctet = parseInt(address.split('.')[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return null;
    }

    // Block IPv6 localhost and Link-Local
    if (address === '::1') return null;
    if (address.toLowerCase().startsWith('fe80:')) return null;

    return address; // Host safely resolved to a public, external IP
  } catch (e) {
    return null; // DNS resolution failed
  }
}

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
    const absolutePdfPath = path.join(process.cwd(), 'public', invoice.pdfPath);
    if (!fs.existsSync(absolutePdfPath)) {
      return NextResponse.json({ error: 'The original PDF file could not be found on the server.' }, { status: 404 });
    }

    // 5. SECURITY: SSRF PROTECTED SMTP RESOLUTION
    const safeIp = await resolveSafeIp(profile.smtpHost);
    if (!safeIp) {
      console.error(`Blocked SSRF attempt in SMTP configuration: ${profile.smtpHost}`);
      return NextResponse.json({ error: 'Invalid or internal SMTP Host blocked by security policy.' }, { status: 400 });
    }

    // 6. TRANSMIT EMAIL
    const transporter = nodemailer.createTransport({
      host: safeIp,
      port: profile.smtpPort || 587,
      secure: profile.smtpPort === 465, 
      tls: {
        servername: profile.smtpHost 
      },
      auth: {
        user: profile.smtpUser,
        pass: profile.smtpPassword,
      },
    });

    const formattedTotal = invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pdfFilename = invoice.pdfPath.split('/').pop() || `${invoice.invoiceNumber.replace(/\//g, '_')}.pdf`;

    const mailOptions = {
      from: `"${profile.companyName}" <${profile.smtpFromEmail || profile.smtpUser}>`,
      to: invoice.client.email,
      subject: `Invoice ${invoice.invoiceNumber} from ${profile.companyName}`,
      text: `Dear ${invoice.client.name},\n\nPlease find attached the invoice ${invoice.invoiceNumber} for the billing month of ${invoice.billingMonth}.\n\nTotal Amount Billed: INR ${formattedTotal}\n\nThank you for your business.\n\nBest Regards,\n${profile.companyName}`,
      attachments: [
        {
          filename: pdfFilename,
          path: absolutePdfPath, 
        }
      ]
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: 'Email resent successfully.' });

  } catch (error: any) {
    console.error("Resend Email Error:", error);
    return NextResponse.json({ error: error.message || 'Failed to resend the invoice email.' }, { status: 500 });
  }
}