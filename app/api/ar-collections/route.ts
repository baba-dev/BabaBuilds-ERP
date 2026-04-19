import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { getArCollectionsSnapshot, runReminderAutomation } from '@/lib/ar-collections';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await requireModule(session.workspaceId, 'AR_COLLECTIONS');
    } catch (error) {
      if (error instanceof ModuleDisabledError) {
        return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      }
      throw error;
    }

    const snapshot = await getArCollectionsSnapshot(session.workspaceId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[ar-collections/GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await requireModule(session.workspaceId, 'AR_COLLECTIONS');
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

    const result = await runReminderAutomation(session.workspaceId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ar-collections/POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
