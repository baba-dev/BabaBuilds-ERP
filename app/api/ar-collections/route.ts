import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { getArCollectionsSnapshot, runReminderAutomation } from '@/lib/ar-collections';
import { withPermission } from '@/lib/rbac';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceIdForUser(userId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const view = await withPermission(userId, workspaceId, 'invoices.view');
    if (!view.granted) return view.response;

    try {
      await requireModule(workspaceId, 'AR_COLLECTIONS');
    } catch (error) {
      if (error instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      }
      throw error;
    }

    const snapshot = await getArCollectionsSnapshot(workspaceId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[ar-collections/GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceIdForUser(userId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const edit = await withPermission(userId, workspaceId, 'invoices.edit');
    if (!edit.granted) return edit.response;

    try {
      await requireModule(workspaceId, 'AR_COLLECTIONS');
    } catch (error) {
      if (error instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      }
      throw error;
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== 'RUN_REMINDERS') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    try {
      const result = await runReminderAutomation(workspaceId, {
        userId,
        email: session?.user?.email ?? null,
      });
      return NextResponse.json(result);
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (code === 'RATE_LIMIT_COOLDOWN') {
        return NextResponse.json(
          { error: 'Wait before running automation again.', code: 'RATE_LIMIT_COOLDOWN' },
          { status: 429 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error('[ar-collections/POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
