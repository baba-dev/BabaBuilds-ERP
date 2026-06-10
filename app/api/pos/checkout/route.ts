import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const body = await request.json();
    const { action, clientId, items, discount = 0 } = body;
    // action: 'PAY_NOW', 'INVOICE', 'PROPOSAL', 'RETAINER'

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    let resolvedClientId = clientId;
    if (!resolvedClientId && (action === 'INVOICE' || action === 'PROPOSAL' || action === 'RETAINER')) {
      return NextResponse.json({ error: `Client is required for ${action} action.` }, { status: 400 });
    }

    // Default Walk-in Client if none provided
    if (!resolvedClientId) {
      let walkIn = await prisma.client.findFirst({ where: { workspaceId, name: 'Walk-in Customer' } });
      if (!walkIn) {
        walkIn = await prisma.client.create({
          data: { workspaceId, name: 'Walk-in Customer', email: 'walkin@example.com', address: '', country: '' }
        });
      }
      resolvedClientId = walkIn.id;
    }

    const client = await prisma.client.findUnique({ where: { id: resolvedClientId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

    const totalAmount = items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0) - discount;

    if (action === 'PAY_NOW') {
      // Create an Invoice marked as PAID
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
          invoiceNumber: `POS-${Date.now().toString().slice(-6)}`,
          financialYear: new Date().getFullYear().toString(),
          invoiceDate: new Date(),
          clientName: client.name,
          serviceDescription: 'POS Checkout',
          totalAmount: totalAmount,
          status: 'PAID',
          amountReceived: totalAmount,
          dateReceived: new Date(),
          pdfPath: '',
          items: {
            create: items.map((i: any) => ({
              title: i.name,
              description: i.description || '',
              quantity: i.quantity,
              unitPrice: i.price,
              total: i.price * i.quantity,
            }))
          }
        }
      });
      return NextResponse.json({ success: true, message: 'Payment collected successfully!', invoice });
    } else if (action === 'INVOICE') {
      const invoice = await prisma.invoice.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          financialYear: new Date().getFullYear().toString(),
          invoiceDate: new Date(),
          clientName: client.name,
          serviceDescription: 'POS Generated Invoice',
          totalAmount: totalAmount,
          status: 'PENDING',
          pdfPath: '',
          items: {
            create: items.map((i: any) => ({
              title: i.name,
              description: i.description || '',
              quantity: i.quantity,
              unitPrice: i.price,
              total: i.price * i.quantity,
            }))
          }
        }
      });
      return NextResponse.json({ success: true, message: 'Invoice generated and saved.', invoice });
    } else if (action === 'PROPOSAL') {
      const proposal = await prisma.proposal.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
          proposalNo: `PRP-${Date.now().toString().slice(-6)}`,
          title: 'POS Generated Proposal',
          subtotal: totalAmount,
          estimatedTax: 0,
          totalAmount: totalAmount,
          validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
          status: 'DRAFT',
          items: {
            create: items.map((i: any) => ({
              title: i.name,
              description: i.description || '',
              quantity: i.quantity,
              unitPrice: i.price,
              total: i.price * i.quantity,
            }))
          }
        }
      });
      return NextResponse.json({ success: true, message: 'Proposal drafted successfully!', proposal });
    } else if (action === 'RETAINER') {
      const retainer = await prisma.retainer.create({
        data: {
          workspaceId,
          clientId: resolvedClientId,
          frequency: 'MONTHLY',
          nextBillingDate: new Date(),
          status: 'ACTIVE',
          items: {
            create: items.map((i: any) => ({
              title: i.name,
              quantity: i.quantity,
              unitPrice: i.price,
              taxRate: i.taxRate || 0,
              serviceTemplateId: i.type === 'SERVICE' && i.id ? i.id : null,
              productId: i.type === 'PRODUCT' && i.id ? i.id : null,
            }))
          }
        }
      });
      return NextResponse.json({ success: true, message: 'Monthly Retainer activated!', retainer });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error("POS Checkout Error:", error);
    return NextResponse.json({ error: 'Failed to process POS checkout' }, { status: 500 });
  }
}
