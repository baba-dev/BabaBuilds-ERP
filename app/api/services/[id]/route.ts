import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    // params needs to be awaited in Next 15+
    const { id } = await context.params; 

    const result = await prisma.serviceTemplate.deleteMany({
      where: { id: id, workspaceId: (session as any).workspaceId } // Secure multi-tenant delete
    });

    if (result.count === 0) return NextResponse.json({ error: "Service not found or unauthorized." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete service" }, { status: 500 });
  }
}