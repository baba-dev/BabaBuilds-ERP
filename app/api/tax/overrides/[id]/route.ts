import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createTaxOverrideAuditLog, logActivity } from '@/lib/security/activity-log';
import { RbacDeniedError, requirePermission } from '@/lib/rbac';
import { hasPermission, isValidBusinessRole } from '@/lib/permissions';
import { taxAdvancedModuleDisabledResponse } from '@/lib/tax/module-gate';
import type { Session } from 'next-auth';

type SessionWithWorkspace = Session & { workspaceId?: string; user?: Session['user'] & { id?: string } };
type TaxOverridePatchBody = {
  deactivate?: boolean;
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const typedSession = session as SessionWithWorkspace | null;
    if (!typedSession?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const workspaceId = typedSession.workspaceId;
    const actorUserId = typedSession.user?.id ?? null;
    const actorEmail = typedSession.user?.email ?? null;
    if (!actorUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const moduleDisabledResponse = await taxAdvancedModuleDisabledResponse(workspaceId);
    if (moduleDisabledResponse) return moduleDisabledResponse;
    await requirePermission(actorUserId, workspaceId, 'tax.edit');

    const checker = getCheckerContext(request);
    if (!checker.valid) {
      return NextResponse.json({ error: checker.error }, { status: 400 });
    }

    if (checker.checkerUserId === actorUserId) {
      return NextResponse.json({ error: 'Maker and checker must be different users.' }, { status: 400 });
    }

    const existing = await prisma.taxRateOverride.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      return NextResponse.json({ error: 'Tax override not found.' }, { status: 404 });
    }

    const body = (await request.json()) as TaxOverridePatchBody;
    const deactivate = Boolean(body?.deactivate);

    const data: Record<string, unknown> = {};

    if (typeof body?.rate !== 'undefined') {
      const rate = Number(body.rate);
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json({ error: 'Invalid rate. Expected 0 to 100.' }, { status: 400 });
      }
      data.rate = rate;
    }

    if (typeof body?.scopeType !== 'undefined') {
      const scopeType = String(body.scopeType).toUpperCase();
      if (!['WORKSPACE', 'CLIENT', 'SERVICE'].includes(scopeType)) {
        return NextResponse.json({ error: 'Invalid scopeType.' }, { status: 400 });
      }
      data.scopeType = scopeType;
    }

    if (typeof body?.scopeRef !== 'undefined') data.scopeRef = body.scopeRef ? String(body.scopeRef) : null;
    if (typeof body?.reason !== 'undefined') data.reason = body.reason ? String(body.reason).trim() : null;

    if (typeof body?.effectiveFrom !== 'undefined') {
      const effectiveFrom = toOptionalDate(body.effectiveFrom);
      if (!effectiveFrom) {
        return NextResponse.json({ error: 'Invalid effectiveFrom date.' }, { status: 400 });
      }
      data.effectiveFrom = effectiveFrom;
    }

    if (typeof body?.effectiveTo !== 'undefined') {
      data.effectiveTo = toOptionalDate(body.effectiveTo);
      if (body.effectiveTo && !data.effectiveTo) {
        return NextResponse.json({ error: 'Invalid effectiveTo date.' }, { status: 400 });
      }
    }

    if (deactivate) {
      data.isActive = false;
      data.deactivatedAt = new Date();
    }

    const effectiveFromToValidate = data.effectiveFrom ?? existing.effectiveFrom;
    const effectiveToToValidate = data.effectiveTo === undefined ? existing.effectiveTo : data.effectiveTo;
    if (effectiveToToValidate && effectiveFromToValidate > effectiveToToValidate) {
      return NextResponse.json({ error: 'effectiveFrom cannot be after effectiveTo.' }, { status: 400 });
    }

    const updated = await prisma.taxRateOverride.update({
      where: { id: existing.id },
      data,
    });

    await createTaxOverrideAuditLog({
      workspaceId,
      taxRateOverrideId: updated.id,
      action: deactivate ? 'DEACTIVATE' : 'UPDATE',
      decisionSource: 'OVERRIDE',
      scopeType: updated.scopeType,
      scopeRef: updated.scopeRef,
      rate: updated.rate,
      effectiveFrom: updated.effectiveFrom,
      effectiveTo: updated.effectiveTo,
      reason: updated.reason,
      previousValues: existing,
      newValues: updated,
      actorUserId,
      actorEmail,
    });

    await logActivity({
      action: 'tax_override_approval',
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: checker.checkerUserId,
      },
      entity: {
        type: 'tax_override_approval',
        id: updated.id,
      },
      metadata: {
        approvedAction: deactivate ? 'DEACTIVATE' : 'UPDATE',
        checkerRole: checker.checkerRole,
        makerUserId: actorUserId,
      },
      request,
    });

    await logActivity({
      action: 'tax_override_update',
      status: 'SUCCESS',
      workspaceId,
      actor: {
        userId: actorUserId,
        email: actorEmail,
      },
      entity: {
        type: 'tax_rate_override',
        id: updated.id,
      },
      metadata: {
        mutationType: deactivate ? 'DEACTIVATE' : 'UPDATE',
        checkerUserId: checker.checkerUserId,
        checkerRole: checker.checkerRole,
        deactivate,
      },
      request,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof RbacDeniedError) {
      return NextResponse.json({ error: 'Forbidden', code: 'RBAC_DENIED' }, { status: 403 });
    }
    const session = (await getServerSession(authOptions)) as SessionWithWorkspace | null;
    if (session?.workspaceId) {
      await logActivity({
        action: 'tax_override_update',
        status: 'FAILURE',
        workspaceId: session.workspaceId,
        actor: {
          userId: session?.user?.id ?? null,
          email: session?.user?.email ?? null,
        },
        metadata: {
          reason: error instanceof Error ? error.message : 'unknown_error',
        },
      });
    }
    console.error('Tax override PATCH error', error);
    return NextResponse.json({ error: 'Failed to update tax override' }, { status: 500 });
  }
}
