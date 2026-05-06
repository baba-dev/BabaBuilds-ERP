import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import fs from 'fs';
import path from 'path';
import { logActivity } from '@/lib/security/activity-log';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import { withPermission } from '@/lib/rbac';

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
    const userId = (session as any).user?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // RBAC: viewing an invoice requires invoices.view
    const perm = await withPermission(userId, workspaceId, 'invoices.view');
    if (!perm.granted) return perm.response;
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
    const userId = (session as any).user?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // RBAC: deleting an invoice requires invoices.delete
    const perm = await withPermission(userId, workspaceId, 'invoices.delete');
    if (!perm.granted) return perm.response;
    const resolvedParams = await params;
    const invoiceId = resolvedParams.id;

    // 1. Fetch to get the PDF path for cleanup
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, workspaceId: workspaceId }
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found or unauthorized." }, { status: 404 });
    }

    // 2. Delete from Database with tenant scope safety
    const deleted = await prisma.invoice.deleteMany({
      where: { id: invoiceId, workspaceId }
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Invoice not found or unauthorized." }, { status: 404 });
    }

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
