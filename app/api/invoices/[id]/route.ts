import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';

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
      const filePath = path.join(process.cwd(), 'public', invoice.pdfPath);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
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