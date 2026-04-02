import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const proposals = await prisma.proposal.findMany({
      where: { workspaceId: workspaceId },
      include: { client: true },
      orderBy: { dateCreated: 'desc' }
    });

    return NextResponse.json(proposals);
  } catch (error) {
    console.error("Fetch Proposals Error:", error);
    return NextResponse.json({ error: 'Failed to fetch proposals' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const body = await request.json();
    const { clientId, title, validUntil, items } = body;

    const client = await prisma.client.findFirst({ 
      where: { id: clientId, workspaceId } 
    });
    if (!client) {
      return NextResponse.json({ error: "Invalid client selected." }, { status: 400 });
    }

    if (!client.email || client.email.trim() === '') {
      return NextResponse.json(
        { error: `Cannot create proposal. The client "${client.name}" must have a valid email address on file for digital signatures.` }, 
        { status: 400 }
      );
    }

    // Auto-Sequence the Proposal Number
    const currentYear = new Date().getFullYear();
    const shortYear = currentYear.toString().slice(-2);
    
    const lastProposal = await prisma.proposal.findFirst({
      where: { workspaceId },
      orderBy: { dateCreated: 'desc' }
    });

    let sequence = 1;
    if (lastProposal && lastProposal.proposalNo) {
      const parts = lastProposal.proposalNo.split('-');
      if (parts.length === 3 && !isNaN(parseInt(parts[2]))) {
        sequence = parseInt(parts[2]) + 1;
      }
    }
    const proposalNo = `EST-${shortYear}-${sequence.toString().padStart(3, '0')}`;

    // Calculate Totals
    const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
    const estimatedTax = client.isExport ? 0 : subtotal * 0.18; 
    const totalAmount = subtotal + estimatedTax;

    const newProposal = await prisma.proposal.create({
      data: {
        workspaceId,
        clientId,
        title,
        proposalNo,
        validUntil: new Date(validUntil),
        subtotal,
        estimatedTax,
        totalAmount,
        status: "SENT",
        items: {
          create: items.map((item: any) => ({
            serviceTemplateId: item.serviceTemplateId || null,
            title: item.title,
            description: item.description || null,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            total: Number(item.quantity) * Number(item.unitPrice)
          }))
        }
      }
    });

    return NextResponse.json({ success: true, proposal: newProposal });
  } catch (error) {
    console.error("Proposal Creation Error:", error);
    return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 });
  }
}