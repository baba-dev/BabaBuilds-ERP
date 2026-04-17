import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createTaxOverrideAuditLog, logActivity } from '@/lib/security/activity-log';
import { RbacDeniedError, requirePermission } from '@/lib/rbac';
import { hasPermission, isValidBusinessRole } from '@/lib/permissions';
import type { Session } from 'next-auth';

type SessionWithWorkspace = Session & { workspaceId?: string; user?: Session['user'] & { id?: string } };

type TaxOverrideCreateBody = {
  rate?: number | string;
  scopeType?: string;
  scopeRef?: string | null;
  reason?: string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
};



const getCheckerContext = (request: Request) => {
  const checkerUserId = request.headers.get('x-checker-user-id');
  const checkerRole = request.headers.get('x-checker-role');

  if (!checkerUserId || !checkerRole) {
    return { valid: false as const, error: 'Maker-checker approval headers are required for tax config edits.' };
  }

  const normalizedRole = checkerRole.toUpperCase();
  if (!isValidBusinessRole(normalizedRole) || !hasPermission(normalizedRole, 'tax.approve')) {
    return { valid: false as const, error: 'Checker must have tax.approve permission.' };
  }

  return {
    valid: true as const,
    checkerUserId,
    checkerRole: normalizedRole,
  };
};

const toOptionalDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as SessionWithWorkspace | null;
    if (!typedSession?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = typedSession.workspaceId;
    if (!typedSession.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requirePermission(typedSession.user.id, workspaceId, 'tax.view');

    const overrides = await prisma.taxRateOverride.findMany({
      where: { workspaceId },
      orderBy: [{ isActive: 'desc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ data: overrides });
  } catch (error) {
    if (error instanceof RbacDeniedError) {
      return NextResponse.json({ error: 'Forbidden', code: 'RBAC_DENIED' }, { status: 403 });
    }
    console.error('Tax overrides GET error', error);
    return NextResponse.json({ error: 'Failed to fetch tax overrides' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as SessionWithWorkspace | null;
    if (!typedSession?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = typedSession.workspaceId;
    const actorUserId = typedSession.user?.id ?? null;
    const actorEmail = typedSession.user?.email ?? null;
    if (!actorUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requirePermission(actorUserId, workspaceId, 'tax.edit');

    const checker = getCheckerContext(request);
    if (!checker.valid) {
      return NextResponse.json({ error: checker.error }, { status: 400 });
    }

    if (checker.checkerUserId === actorUserId) {
      return NextResponse.json({ error: 'Maker and checker must be different users.' }, { status: 400 });
    }

    const body = (await request.json()) as TaxOverrideCreateBody;
    const rate = Number(body?.rate);
    const scopeType = String(body?.scopeType ?? 'WORKSPACE').toUpperCase();
    const scopeRef = body?.scopeRef ? String(body.scopeRef) : null;
    const reason = body?.reason ? String(body.reason).trim() : null;
    const effectiveFrom = toOptionalDate(body?.effectiveFrom) ?? new Date();
    const effectiveTo = toOptionalDate(body?.effectiveTo);

    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: 'Invalid rate. Expected 0 to 100.' }, { status: 400 });
    }

    if (!['WORKSPACE', 'CLIENT', 'SERVICE'].includes(scopeType)) {
      return NextResponse.json({ error: 'Invalid scopeType.' }, { status: 400 });
    }

    if (effectiveTo && effectiveFrom > effectiveTo) {
      return NextResponse.json({ error: 'effectiveFrom cannot be after effectiveTo.' }, { status: 400 });
    }

    const created = await prisma.taxRateOverride.create({
      data: {
        workspaceId,
        scopeType,
        scopeRef,
        rate,
        effectiveFrom,
        effectiveTo,
        reason,
        createdByUserId: actorUserId,
        createdByEmail: actorEmail,
      },
    });

    await createTaxOverrideAuditLog({
      workspaceId,
      taxRateOverrideId: created.id,
      action: 'CREATE',
      decisionSource: 'OVERRIDE',
      scopeType: created.scopeType,
      scopeRef: created.scopeRef,
      rate: created.rate,
      effectiveFrom: created.effectiveFrom,
      effectiveTo: created.effectiveTo,
      reason: created.reason,
      previousValues: null,
      newValues: created,
      actorUserId,
      actorEmail,
    });

    const decisionAction = 'tax_override_approval';
    await logActivity({
      action: decisionAction,
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: checker.checkerUserId,
      },
      entity: {
        type: 'tax_override_approval',
        id: created.id,
      },
      metadata: {
        approvedAction: 'CREATE',
        checkerRole: checker.checkerRole,
        makerUserId: actorUserId,
      },
      request,
    });

    await logActivity({
      action: 'tax_override_create',
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: actorUserId,
        email: actorEmail,
      },
      entity: {
        type: 'tax_rate_override',
        id: created.id,
      },
      metadata: {
        mutationType: 'CREATE',
        checkerUserId: checker.checkerUserId,
        checkerRole: checker.checkerRole,
        scopeType: created.scopeType,
      },
      request,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof RbacDeniedError) {
      return NextResponse.json({ error: 'Forbidden', code: 'RBAC_DENIED' }, { status: 403 });
    }
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    if (session?.workspaceId) {
      await logActivity({
        action: 'tax_override_create',
        status: 'FAILURE',
        workspaceId: session?.workspaceId,
        actor: {
          userId: session?.user?.id ?? null,
          email: session?.user?.email ?? null,
        },
        metadata: {
          reason: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }
    console.error('Tax overrides POST error', error);
    return NextResponse.json({ error: 'Failed to create tax override' }, { status: 500 });
  }
}
