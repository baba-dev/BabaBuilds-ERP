import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-ip';
import { parseProposalSections } from '@/lib/proposals/parser';
import { logActivity } from '@/lib/security/activity-log';

// Fetch the proposal data publicly using the secure token
export async function GET(
  request: Request, 
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;

    const proposal = await prisma.proposal.findUnique({
      where: { publicToken: token },
      include: { client: true, items: true, billingMilestones: true }
    });

    if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    const richSections = parseProposalSections(proposal);
    return NextResponse.json({ proposal: { ...proposal, richSections } });
  } catch {
    return NextResponse.json({ error: "Failed to load proposal." }, { status: 500 });
  }
}

// Handle the Client's Digital Signature / Acceptance
export async function PATCH(
  request: Request, 
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;
    
    // 1. Get the verification string and optional selectedItemIds from the frontend 
    // (The frontend sends it as 'email', but we treat it as a generic identifier)
    const body = await request.json().catch(() => ({}));
    const { email: providedIdentifier, selectedItemIds, signatureBase64 } = body; 

    if (!providedIdentifier) {
      return NextResponse.json({ error: 'Verification required.' }, { status: 400 });
    }

    // 2. Fetch the proposal and associated client
    const proposal = await prisma.proposal.findUnique({
      where: { publicToken: token },
      include: { client: true, items: true }
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    }

    if (proposal.status === 'ACCEPTED') {
      return NextResponse.json({ error: 'Proposal is already accepted.' }, { status: 400 });
    }

    // --- 🚨 SECURITY PATCH START (Infinite Quote Vulnerability) ---
    // Prevent clients from legally binding the agency to years-old expired pricing
    if (new Date() > new Date(proposal.validUntil)) {
      return NextResponse.json({ 
        error: 'This proposal has expired and can no longer be accepted. Please request a new quote.' 
      }, { status: 403 });
    }
    // --- 🚨 SECURITY PATCH END ---

    // --- 🚨 SECURITY & LOGIC PATCH START (Graceful Fallback) ---
    const clientEmail = proposal.client.email?.toLowerCase().trim();
    const clientName = proposal.client.name?.toLowerCase().trim();
    const input = providedIdentifier.toLowerCase().trim();

    // Logic: If email exists, strict email match. If no email, fallback to exact Company Name match.
    if (clientEmail) {
      if (clientEmail !== input) {
        return NextResponse.json({ error: 'Identity verification failed. Invalid email.' }, { status: 403 });
      }
    } else if (clientName) {
      if (clientName !== input) {
        return NextResponse.json({ 
          error: `Verification failed. Since we don't have an email on file, please enter your exact Company Name to digitally sign.` 
        }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: 'Verification failed. Client data missing.' }, { status: 403 });
    }
    // --- 🚨 SECURITY & LOGIC PATCH END ---

    // Recalculate totals directly on the proposal record based on client final selections
    let finalSubtotal = Number(proposal.subtotal);
    let finalEstimatedTax = Number(proposal.estimatedTax);
    let finalTotalAmount = Number(proposal.totalAmount);
    const { Prisma } = await import('@prisma/client');

    if (Array.isArray(selectedItemIds)) {
      // 1. Update each item's isSelected state
      for (const item of proposal.items) {
        const isSelected = !item.isOptional || selectedItemIds.includes(item.id);
        await prisma.proposalItem.update({
          where: { id: item.id },
          data: { isSelected }
        });
      }

      // 2. Fetch updated items
      const updatedItems = await prisma.proposalItem.findMany({
        where: { proposalId: proposal.id }
      });

      // 3. Recalculate Subtotal
      const activeItems = updatedItems.filter(item => item.isSelected);
      finalSubtotal = activeItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);

      // 4. Recalculate Tax proportionally
      const originalSubtotal = Number(proposal.subtotal);
      if (originalSubtotal > 0) {
        const taxRate = Number(proposal.estimatedTax) / originalSubtotal;
        finalEstimatedTax = finalSubtotal * taxRate;
      } else {
        finalEstimatedTax = 0;
      }
      finalTotalAmount = finalSubtotal + finalEstimatedTax;

      // 5. Proportional milestone scaling
      const originalTotal = Number(proposal.totalAmount);
      if (originalTotal > 0 && Math.abs(finalTotalAmount - originalTotal) > 0.01) {
        const ratio = finalTotalAmount / originalTotal;
        const milestones = await prisma.billingMilestone.findMany({
          where: { proposalId: proposal.id }
        });
        
        let allocatedAmount = 0;
        for (let i = 0; i < milestones.length; i++) {
          const m = milestones[i];
          let newAmount = Number(m.amount) * ratio;
          
          if (i === milestones.length - 1) {
            newAmount = finalTotalAmount - allocatedAmount;
          } else {
            allocatedAmount += Number(newAmount.toFixed(2));
          }

          await prisma.billingMilestone.update({
            where: { id: m.id },
            data: { amount: new Prisma.Decimal(Number(newAmount.toFixed(2))) }
          });
        }
      }
    }

    // Grab the client's IP address from trusted proxy headers for the audit trail.
    const clientIp = getClientIp(request);

    const updatedProposal = await prisma.proposal.update({
      where: { publicToken: token },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        clientIp: clientIp,
        subtotal: finalSubtotal,
        estimatedTax: finalEstimatedTax,
        totalAmount: finalTotalAmount,
        clientSignatureBase64: signatureBase64 || null,
      }
    });

    // Log acceptance to the activity feed
    await logActivity({
      action: 'proposal_accepted',
      status: 'SUCCESS',
      workspaceId: proposal.workspaceId,
      actor: { email: proposal.client.email || 'Anonymous Client' },
      entity: { type: 'proposal', id: proposal.id },
      ipAddress: clientIp === 'unknown' ? null : clientIp,
      userAgent: request.headers.get('user-agent') || null,
      metadata: {
        acceptedByName: proposal.client.name,
        finalTotalAmount
      }
    });

    return NextResponse.json({ success: true, status: updatedProposal.status });
  } catch (error) {
    console.error("Proposal Acceptance Error:", error);
    return NextResponse.json({ error: 'Failed to accept proposal.' }, { status: 500 });
  }
}