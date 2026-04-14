import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import fs from 'fs';
import path from 'path';
import { logActivity } from '@/lib/security/activity-log';
import { buildPrivatePath } from '@/lib/uploads/private-storage';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
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
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;
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
      const privatePath = buildPrivatePath('invoices', normalizedRelativePath.split(path.sep));
      if (fs.existsSync(privatePath)) {
        try {
          fs.unlinkSync(privatePath);
        } catch {
          console.error("Failed to delete PDF file");
        }
      }
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'delete' });
    }

    logActivity({
      action: "invoice_deleted",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: session.user?.id, email: session.user?.email },
      entity: { type: "invoice", id: invoiceId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoice Deletion Error:", error);
    logActivity({
      action: "invoice_deleted",
      status: "FAILURE",
      workspaceId: null,
      request,
      metadata: { error: String(error) },
    });
    return NextResponse.json({ error: "Failed to delete invoice." }, { status: 500 });
  }
}
