import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import { CLIENT_LOGO_INVALID_TYPE_ERROR, isAllowedClientLogoExtension } from '@/lib/uploads/client-logo';

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const whereClause = { workspaceId: workspaceId };

    // 2. PAGINATION PARAMETERS
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '9'); // 9 clients per page for a 3-column grid
    const skip = (page - 1) * limit;

    // 3. FETCH PAGINATED DATA & TOTAL COUNT CONCURRENTLY
    const [clients, totalClients] = await Promise.all([
      prisma.client.findMany({
        where: whereClause,
        orderBy: { name: 'asc' },
        skip: skip,
        take: limit,
      }),
      prisma.client.count({ where: whereClause })
    ]);
    
    // 4. CONSTRUCT PAGINATED RESPONSE
    return NextResponse.json({
      data: clients,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalClients / limit),
        totalRecords: totalClients,
      }
    });
  } catch (error) {
    console.error("API Error fetching clients:", error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // --- 🚨 SAAS MONETIZATION BARRICADE START ---
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { planTier: true, _count: { select: { clients: true } } }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // The Rule: Free tier gets 3 clients max.
    if (workspace.planTier === "FREE" && workspace._count.clients >= 3) {
      return NextResponse.json({ 
        error: 'Upgrade Required', 
        message: 'You have reached the limit of 3 clients on the Free plan. Upgrade to Pro for unlimited clients.',
        requiresUpgrade: true 
      }, { status: 403 });
    }
    // --- 🚨 SAAS MONETIZATION BARRICADE END ---

    const formData = await request.formData();    
    const name = formData.get('name') as string;
    const address = formData.get('address') as string;
    const country = formData.get('country') as string;
    const taxId = formData.get('taxId') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const isExport = formData.get('isExport') === 'true';
    
    const file = formData.get('logo') as File | null;
    let logoUrl = null;

    if (file && file.size > 0) {
      const ext = path.extname(file.name).toLowerCase();
      if (!isAllowedClientLogoExtension(ext)) {
        return NextResponse.json({ error: CLIENT_LOGO_INVALID_TYPE_ERROR }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
      }

      const dir = path.join(process.cwd(), 'public', 'logos', workspaceId); 
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `client-${Date.now()}-${uuidv4()}${ext}`;

      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buffer);
      logoUrl = `/logos/${workspaceId}/${filename}`;
    }

    // 3. CREATE WITH WORKSPACE ID
    const newClient = await prisma.client.create({
      data: {
        workspaceId: workspaceId, // <-- Multi-tenant lock
        name, address, country,
        taxId: taxId || null,
        email: email || null,
        phone: phone || null,
        isExport,
        logoUrl
      }
    });

    return NextResponse.json({ success: true, client: newClient });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}