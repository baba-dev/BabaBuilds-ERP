import type { Session } from "next-auth";
import { getClientRetainerSummaries } from '@/lib/retainers/client-summary';
import { parseClientGstInput } from '@/lib/gst/client-state';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import { CLIENT_LOGO_INVALID_TYPE_ERROR, isAllowedClientLogoExtension } from '@/lib/uploads/client-logo';
import { apiError } from '@/lib/api-error';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { logActivity } from '@/lib/security/activity-log';
import { FREE_TIER_CLIENT_LIMIT, shouldApplyFreeTierLimits } from '@/lib/entitlements';
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from '@/lib/uploads/private-storage';

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = session.workspaceId;
    const whereClause = { workspaceId: workspaceId };

    // 2. PAGINATION PARAMETERS
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    const parseIntegerParam = (value: string | null): number | null => {
      if (value === null || value.trim() === '') return null;
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || !Number.isInteger(numericValue)) {
        return Number.NaN;
      }
      return numericValue;
    };

    const parsedPage = parseIntegerParam(pageParam);
    const parsedLimit = parseIntegerParam(limitParam);

    if (Number.isNaN(parsedPage) || Number.isNaN(parsedLimit)) {
      return apiError(400, "Invalid pagination parameters", "PAGINATION_INVALID_PARAMS");
    }

    if ((parsedPage !== null && parsedPage < 0) || (parsedLimit !== null && parsedLimit < 0)) {
      return apiError(400, "Pagination parameters cannot be negative", "PAGINATION_NEGATIVE_VALUES");
    }

    const page = Math.max(1, parsedPage ?? 1);
    const limit = Math.min(100, Math.max(1, parsedLimit ?? 9)); // Safe range: 1..100 (default 9)
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
    
    // 3b. RECURRING BILLING SUMMARY per client on this page (two grouped queries, no N+1)
    const retainerSummary = await getClientRetainerSummaries(workspaceId, clients.map((c) => c.id));

    // 4. CONSTRUCT PAGINATED RESPONSE
    return NextResponse.json({
      data: clients.map((c) => ({ ...c, retainerSummary: retainerSummary.get(c.id) })),
      meta: {
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(totalClients / limit)),
        totalRecords: totalClients,
      }
    });
  } catch (error) {
    console.error("API Error fetching clients:", error);
    return apiError(500, "Failed to fetch clients", "CLIENTS_FETCH_FAILED");
  }
}

export async function POST(request: Request) {
  let session: Session | null = null;
  try {
    // 1. SECURITY LOCK
    session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return apiError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const workspaceId = session.workspaceId;

    // --- 🚨 SAAS MONETIZATION BARRICADE START ---
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        planTier: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        _count: { select: { clients: true } },
      },
    });

    if (!workspace) {
      return apiError(404, "Workspace not found", "WORKSPACE_NOT_FOUND");
    }

    // Free tier (non-trial): FREE_TIER_CLIENT_LIMIT clients max.
    if (shouldApplyFreeTierLimits(workspace) && workspace._count.clients >= FREE_TIER_CLIENT_LIMIT) {
      return apiError(403, "Upgrade Required", "PLAN_LIMIT_REACHED", {
        message: `You have reached the limit of ${FREE_TIER_CLIENT_LIMIT} clients on the Free plan. Upgrade to Pro for unlimited clients.`,
        requiresUpgrade: true,
      });
    }
    // --- 🚨 SAAS MONETIZATION BARRICADE END ---

    const formData = await request.formData();    
    const name = formData.get('name') as string;
    const address = formData.get('address') as string;
    const country = formData.get('country') as string;
    const taxId = formData.get('taxId') as string;
    const gstInput = parseClientGstInput({ country, taxId, state: formData.get('gstStateCode'), supplyOverride: formData.get('gstSupplyOverride'), reverseCharge: formData.get('gstReverseCharge') });
    if (!gstInput.ok) return apiError(422, gstInput.message, gstInput.code);
    const { gstStateCode, gstSupplyOverride, gstReverseCharge } = gstInput.data;
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
        return apiError(400, "Malware detected in uploaded file.", "MALWARE_DETECTED");
      }

      const sniffed = sniffAllowedContent(buffer);
      if (!sniffed || (sniffed !== 'png' && sniffed !== 'jpeg' && sniffed !== 'webp' && sniffed !== 'gif')) {
        return apiError(415, "Unsupported or unsafe logo content.", "INVALID_FILE_TYPE");
      }

      const dir = buildPrivatePath('logos', [workspaceId]);
      await ensureDir(dir);
      const storedName = uniqueStoredName(`client-${Date.now()}-${uuidv4()}`, ext);
      const filepath = path.join(dir, storedName);
      fs.writeFileSync(filepath, buffer, { mode: 0o600 });
      logoUrl = `/logos/${workspaceId}/${storedName}`;
    }

    // 3. CREATE WITH WORKSPACE ID
    const newClient = await prisma.client.create({
      data: {
        workspaceId: workspaceId, // <-- Multi-tenant lock
        name, address, country,
        taxId: taxId || null,
        gstStateCode,
        gstSupplyOverride,
        gstReverseCharge,
        email: email || null,
        phone: phone || null,
        isExport,
        logoUrl
      }
    });

    // Fire notification (fire-and-forget)
    dispatchNotification({
      event: 'CLIENT_ADDED',
      workspaceId,
      data: { clientName: newClient.name },
    }).catch(() => null);

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'client', action: 'create' });
    }

    logActivity({
      action: "client_created",
      status: "SUCCESS",
      workspaceId,
      actor: { userId: session.user?.id, email: session.user?.email },
      entity: { type: "client", id: newClient.id },
      request,
    });

    return NextResponse.json({ success: true, client: newClient });
  } catch (error) {
    console.error(error);
    logActivity({
      action: "client_created",
      status: "FAILURE",
      workspaceId: session?.workspaceId ?? "UNKNOWN",
      request,
      metadata: { error: String(error) },
    });
    return apiError(500, "Failed to create client", "CLIENT_CREATE_FAILED");
  }
}
