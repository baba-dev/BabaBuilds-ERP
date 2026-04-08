import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
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

    await prisma.taxDecisionAuditLog.create({
      data: {
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
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Tax override PATCH error', error);
    return NextResponse.json({ error: 'Failed to update tax override' }, { status: 500 });
  }
}
