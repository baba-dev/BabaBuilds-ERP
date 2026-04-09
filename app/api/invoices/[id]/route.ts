import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const resolvedParams = await params;
    const invoiceId = resolvedParams.id;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found or unauthorized." }, { status: 404 });
    }

    return NextResponse.json({ data: invoice });
  } catch (error) {
    console.error("Invoice fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const resolvedParams = await params;
    const invoiceId = resolvedParams.id;

    // 1. Fetch to get the PDF path for cleanup
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId: workspaceId }
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found or unauthorized." }, { status: 404 });
    }

    // 2. Delete from Database
    await prisma.invoice.delete({
      where: { id: invoiceId }
    });

    // 3. Cleanup Orphaned PDF File
    if (invoice.pdfPath) {
      const normalizedRelativePath = invoice.pdfPath.replace(/^[/\\]+/, '');
      const candidatePath = path.join(process.cwd(), 'public', normalizedRelativePath);
      const allowedBaseDir = path.resolve(process.cwd(), 'public', 'invoices');
      const candidateResolvedPath = path.resolve(candidatePath);
      const confinedBasePrefix = `${allowedBaseDir}${path.sep}`;
      const isConfined =
        candidateResolvedPath === allowedBaseDir ||
        candidateResolvedPath.startsWith(confinedBasePrefix);

      if (!isConfined) {
        console.warn(
          `Security warning: Skipping invoice PDF deletion outside allowed directory. invoiceId=${invoiceId}, pdfPath=${invoice.pdfPath}`
        );
      } else if (fs.existsSync(candidateResolvedPath)) {
        try {
          fs.unlinkSync(candidateResolvedPath);
        } catch (e) {
          console.error("Failed to delete PDF file:", e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoice Deletion Error:", error);
    return NextResponse.json({ error: "Failed to delete invoice." }, { status: 500 });
  }
}
