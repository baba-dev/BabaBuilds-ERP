import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workspaceId = (session as any).workspaceId;
    const { id }      = await context.params;
    const body        = await request.json();
    const { status }  = body;

    const allowed = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
    if (!allowed.includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });

    const updated = await prisma.serviceOrder.updateMany({
      where: { id, workspaceId },
      data:  { status },
    });

    if (updated.count === 0) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update order.' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const workspaceId = (session as any).workspaceId;
    const { id }      = await context.params;

    const deleted = await prisma.serviceOrder.deleteMany({ where: { id, workspaceId } });
    if (deleted.count === 0) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete order.' }, { status: 500 });
  }
}
