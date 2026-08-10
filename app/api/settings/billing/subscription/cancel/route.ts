import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  SubscriptionCancellationError,
  scheduleWorkspaceSubscriptionCancellation,
} from '@/lib/billing/subscription-cancellation';
import {
  RbacDeniedError,
  rbacDeniedResponse,
  requirePermission,
} from '@/lib/rbac';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
    const userId = session?.user?.id;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fresh DB membership + exact owner-only billing permission check.
    await requirePermission(userId, workspaceId, 'billing.manage');

    const result = await scheduleWorkspaceSubscriptionCancellation({
      workspaceId,
      actorUserId: userId,
      actorEmail: session.user?.email,
      request: req,
    });

    return NextResponse.json({
      ok: true,
      status: 'CANCELLATION_SCHEDULED',
      alreadyScheduled: result.alreadyScheduled,
      provider: result.provider,
      effectiveAt: result.effectiveAt.toISOString(),
      message:
        'Cancellation is scheduled. Paid access remains active until the confirmed effective date.',
    });
  } catch (error) {
    if (error instanceof RbacDeniedError) {
      return rbacDeniedResponse(error);
    }
    if (error instanceof SubscriptionCancellationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.httpStatus },
      );
    }

    console.error('[billing/subscription/cancel]', error);
    return NextResponse.json(
      {
        error:
          'The billing provider did not confirm cancellation. No local downgrade was applied.',
        code: 'PROVIDER_CANCELLATION_FAILED',
      },
      { status: 502 },
    );
  }
}
