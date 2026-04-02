import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. FETCH RETAINERS (Include Client data for the UI)
    const retainers = await prisma.retainer.findMany({
      where: { workspaceId },
      include: { 
        client: {
          select: { name: true, email: true } // We only need name and email for the UI
        } 
      },
      orderBy: { nextBillingDate: 'asc' } // Show closest billing dates first
    });

    return NextResponse.json(retainers);
  } catch (error) {
    console.error("Fetch Retainers Error:", error);
    return NextResponse.json({ error: 'Failed to fetch retainers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const body = await request.json();
    const { clientId, serviceName, amount, frequency, autoAppendMonth, nextBillingDate } = body;

    // 2. VALIDATE CLIENT OWNERSHIP
    const client = await prisma.client.findFirst({ 
      where: { id: clientId, workspaceId } 
    });
    if (!client) {
      return NextResponse.json({ error: "Invalid client selected." }, { status: 400 });
    }

    // 3. CREATE THE AUTOMATED LOOP
    const newRetainer = await prisma.retainer.create({
      data: {
        workspaceId,
        clientId,
        serviceName,
        amount: Number(amount),
        frequency: frequency || "MONTHLY",
        autoAppendMonth: Boolean(autoAppendMonth),
        nextBillingDate: new Date(nextBillingDate),
        status: "ACTIVE", // Automatically starts running
        sacCode: body.sacCode || null // Optional: inherited from profile if blank
      }
    });


    return NextResponse.json({ success: true, retainer: newRetainer });
  } catch (error) {
    console.error("Retainer Creation Error:", error);
    return NextResponse.json({ error: 'Failed to configure retainer engine' }, { status: 500 });
  }
}