import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/request-ip';

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
      include: { client: true, items: true }
    });

    if (!proposal) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    let richSections: Array<{ title: string; body?: string; mediaUrl?: string }> = [];
    if (proposal.declineReason) {
      try {
        const parsed = JSON.parse(proposal.declineReason) as { richSections?: Array<{ title?: string; body?: string; mediaUrl?: string }> };
        if (Array.isArray(parsed.richSections)) {
          richSections = parsed.richSections
            .map((section) => ({
              title: String(section.title ?? "").trim(),
              body: typeof section.body === "string" ? section.body : "",
              mediaUrl: typeof section.mediaUrl === "string" ? section.mediaUrl : "",
            }))
            .filter((section) => section.title.length > 0);
        }
      } catch {
        // ignore non-json decline reason payloads from older records
      }
    }
    return NextResponse.json({ proposal: { ...proposal, richSections } });
  } catch (error) {
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
    
    // 1. Get the verification string from the frontend 
    // (The frontend sends it as 'email', but we treat it as a generic identifier)
    const body = await request.json().catch(() => ({}));
    const { email: providedIdentifier } = body; 

    if (!providedIdentifier) {
      return NextResponse.json({ error: 'Verification required.' }, { status: 400 });
    }

    // 2. Fetch the proposal and associated client
    const proposal = await prisma.proposal.findUnique({
      where: { publicToken: token },
      include: { client: true }
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

    // Grab the client's IP address from trusted proxy headers for the audit trail.
    const clientIp = getClientIp(request);

    const updatedProposal = await prisma.proposal.update({
      where: { publicToken: token },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        clientIp: clientIp,
      }
    });

    return NextResponse.json({ success: true, status: updatedProposal.status });
  } catch (error) {
    console.error("Proposal Acceptance Error:", error);
    return NextResponse.json({ error: 'Failed to accept proposal.' }, { status: 500 });
  }
}