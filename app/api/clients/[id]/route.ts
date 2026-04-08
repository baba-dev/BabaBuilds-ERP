import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import { CLIENT_LOGO_INVALID_TYPE_ERROR, isAllowedClientLogoExtension } from '@/lib/uploads/client-logo';

export async function DELETE(
  request: Request,
  // 1. Next.js 15 Async Params: `params` must be typed as a Promise
  props: { params: Promise<{ id: string }> } 
) {
  try {
    // SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    
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
        { error: `Cannot delete client. Please remove their associated ${blockers.join(", ")} first.` }, 
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
      return NextResponse.json({ error: "Client not found or unauthorized." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
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
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
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
        return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
      }

      const dir = path.join(process.cwd(), 'public', 'logos', workspaceId);
      try {
        await fs.promises.access(dir);
      } catch {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const filename = `client-${Date.now()}-${uuidv4()}${ext}`;
      const filepath = path.join(dir, filename);
      await fs.promises.writeFile(filepath, buffer);
      
      // Optional: Delete old logo file if it was internal
      if (existingClient.logoUrl && existingClient.logoUrl.startsWith('/logos/')) {
        const oldPath = path.join(process.cwd(), 'public', existingClient.logoUrl);
        try {
          await fs.promises.access(oldPath);
          await fs.promises.unlink(oldPath);
        } catch (e) {
          // If file doesn't exist or deletion fails, we log and continue
          console.error("Failed to delete old logo:", e);
        }
      }

      logoUrl = `/logos/${workspaceId}/${filename}`;
    }

    // 2. Perform Update
    const updatedClient = await prisma.client.update({
      where: { 
        id: clientId,
        workspaceId: workspaceId // Re-enforced multi-tenant security
      },
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

    return NextResponse.json({ success: true, client: updatedClient });
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 });
  }
}