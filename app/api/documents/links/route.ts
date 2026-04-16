import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireModule } from '@/lib/modules';
import { withPermission } from '@/lib/rbac';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const workspaceId = (session as { workspaceId?: string } | null)?.workspaceId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!workspaceId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await requireModule(workspaceId, 'DOCUMENTS');
  } catch {
    return NextResponse.json({ enabled: false, links: [] }, { status: 200 });
  }

  const perm = await withPermission(userId, workspaceId, 'documents.view');
  if (!perm.granted) return perm.response;

  const url = new URL(req.url);
  const targetType = url.searchParams.get('targetType');
  const targetId = url.searchParams.get('targetId');
  if (!targetType || !targetId) {
    return NextResponse.json({ error: 'Missing targetType/targetId' }, { status: 400 });
  }

  const links = await prisma.documentLink.findMany({
    where: { workspaceId, targetType, targetId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      relation: true,
      document: {
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          isArchived: true,
          createdAt: true,
          files: {
            where: { isCurrent: true },
            take: 1,
            select: { storedPath: true, mimeType: true, byteSize: true, originalName: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ enabled: true, links });
}

