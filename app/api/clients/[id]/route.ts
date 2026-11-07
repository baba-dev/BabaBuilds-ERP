import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import fs from 'fs';
import path from 'path';
import { scanBuffer } from '@/lib/security/clamav';
import { CLIENT_LOGO_INVALID_TYPE_ERROR, isAllowedClientLogoExtension } from '@/lib/uploads/client-logo';
import { apiError } from '@/lib/api-error';
import { logActivity } from '@/lib/security/activity-log';
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from '@/lib/uploads/private-storage';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const workspaceId = session.workspaceId;
    const params = await props.params;
    const clientId = params.id;

    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        workspaceId,
      },
    });

    if (!client) {
      return apiError(404, "Client not found", "CLIENT_NOT_FOUND");
    }

    return NextResponse.json({ data: client });
  } catch (error) {
    console.error("Client fetch error:", error);
    return apiError(500, "Failed to fetch client", "CLIENT_FETCH_FAILED");
  }
}

export async function DELETE(
  request: Request,
  // 1. Next.js 15 Async Params: `params` must be typed as a Promise
  props: { params: Promise<{ id: string }> } 
) {
  try {
    // SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = session.workspaceId;
    
    // Await the params object (Next.js 15 strict mode)
    const params = await props.params;
    const clientId = params.id;

    // 2. OPTIMIZED CONCURRENT QUERIES & FOREIGN KEY CRASH PREVENTION
    // We run all three database counts simultaneously instead of awaiting them one by one.
    const [invoiceCount, proposalCount, retainerCount] = await Promise.all([
      prisma.invoice.count({ where: { clientId, workspaceId } }),
      prisma.proposal.count({ where: { clientId, workspaceId } }),
      prisma.retainer.count({ where: { clientId, workspaceId } })
    ]);

    // 3. DYNAMIC ERROR MESSAGING
    // If any relations exist, we build a smart string telling the user exactly what is blocking the deletion.
    if (invoiceCount > 0 || proposalCount > 0 || retainerCount > 0) {
      const blockers = [];
      if (invoiceCount > 0) blockers.push(`${invoiceCount} invoice(s)`);
      if (proposalCount > 0) blockers.push(`${proposalCount} proposal(s)`);
      if (retainerCount > 0) blockers.push(`${retainerCount} retainer(s)`);

      return NextResponse.json(
        {
          error: `Cannot delete client. Please remove their associated ${blockers.join(", ")} first.`,
          code: "CLIENT_HAS_DEPENDENCIES",
          details: { invoiceCount, proposalCount, retainerCount },
        },
        { status: 400 }
      );
    }

    // SECURE DELETION
    // We use deleteMany here because it allows us to filter by both id AND workspaceId simultaneously.
    // If a hacker passes a random client ID that doesn't belong to them, this will safely delete 0 records.
    const result = await prisma.client.deleteMany({
      where: { 
        id: clientId,
        workspaceId: workspaceId 
      }
    });

    if (result.count === 0) {
      return apiError(404, "Client not found or unauthorized.", "CLIENT_NOT_FOUND");
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'client', action: 'delete' });
    }

    logActivity({
      action: "client_deleted",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: session.user?.id, email: session.user?.email },
      entity: { type: "client", id: clientId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    logActivity({
      action: "client_deleted",
      status: "FAILURE",
      workspaceId: null,
      request,
      metadata: { error: String(error) },
    });
    return apiError(500, "Failed to delete client", "CLIENT_DELETE_FAILED");
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = session.workspaceId;
    const params = await props.params;
    const clientId = params.id;

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const address = formData.get('address') as string;
    const country = formData.get('country') as string;
    const taxId = formData.get('taxId') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const isExport = formData.get('isExport') === 'true';
    
    // 1. Check if client exists and belongs to workspace
    const existingClient = await prisma.client.findFirst({
      where: { id: clientId, workspaceId: workspaceId }
    });

    if (!existingClient) {
      return apiError(404, "Client not found", "CLIENT_NOT_FOUND");
    }

    const file = formData.get('logo') as File | null;
    let logoUrl = existingClient.logoUrl;

    if (file && file.size > 0) {
      const ext = path.extname(file.name).toLowerCase();
      if (!isAllowedClientLogoExtension(ext)) {
        return NextResponse.json({ error: CLIENT_LOGO_INVALID_TYPE_ERROR }, { status: 400 });
      }
      
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Malware scan
      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return apiError(400, "Malware detected in uploaded file.", "MALWARE_DETECTED");
      }

      const sniffed = sniffAllowedContent(buffer);
      if (!sniffed || (sniffed !== 'png' && sniffed !== 'jpeg' && sniffed !== 'webp' && sniffed !== 'gif')) {
        return apiError(415, "Unsupported or unsafe logo content.", "INVALID_FILE_TYPE");
      }

      const filepath = buildPrivatePath('logos', [workspaceId, uniqueStoredName('client', ext)]);
      await ensureDir(path.dirname(filepath));
      await fs.promises.writeFile(filepath, buffer, { mode: 0o600 });
      
      // Optional: Delete old logo file if it was internal
      if (existingClient.logoUrl && existingClient.logoUrl.startsWith('/logos/')) {
        const oldSegments = existingClient.logoUrl.replace(/^\/logos\//, '').split('/').filter(Boolean);
        const oldPath = buildPrivatePath('logos', oldSegments);
        try {
          await fs.promises.access(oldPath);
          await fs.promises.unlink(oldPath);
        } catch {
          // If file doesn't exist or deletion fails, we log and continue
          console.error("Failed to delete old logo");
        }
      }

      logoUrl = `/logos/${workspaceId}/${path.basename(filepath)}`;
    }

    // 2. Perform tenant-scoped update
    const updateResult = await prisma.client.updateMany({
      where: { id: clientId, workspaceId },
      data: {
        name,
        address,
        country,
        taxId: taxId || null,
        email: email || null,
        phone: phone || null,
        isExport,
        logoUrl
      }
    });
    if (updateResult.count === 0) {
      return apiError(404, "Client not found", "CLIENT_NOT_FOUND");
    }
    const updatedClient = await prisma.client.findFirst({
      where: { id: clientId, workspaceId },
    });
    if (!updatedClient) {
      return apiError(404, "Client not found", "CLIENT_NOT_FOUND");
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'client', action: 'update' });
    }

    logActivity({
      action: "client_updated",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: session.user?.id, email: session.user?.email },
      entity: { type: "client", id: updatedClient.id },
      request,
    });

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error("Update error:", error);
    logActivity({
      action: "client_updated",
      status: "FAILURE",
      workspaceId: null,
      request,
      metadata: { error: String(error) },
    });
    return apiError(500, "Failed to update client", "CLIENT_UPDATE_FAILED");
  }
}
