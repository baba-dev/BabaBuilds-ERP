import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';

export async function GET() {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    // 2. FETCH ONLY THIS WORKSPACE'S INVESTMENTS
    const investments = await prisma.investment.findMany({
      where: { workspaceId: workspaceId }, // <-- Multi-tenant lock
      orderBy: { date: 'desc' }
    });
    
    return NextResponse.json(investments);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const body = await request.json();
    const { date, category, assetName, amount } = body;

    // 2. SECURE CREATION
    const newInvestment = await prisma.investment.create({
      data: {
        workspaceId: workspaceId, // <-- Required by schema, ties data to the tenant
        date: new Date(date),
        category,
        assetName,
        amount: Number(amount),
      }
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'investment', action: 'create', error: String(error) });
    }

    return NextResponse.json({ success: true, investment: newInvestment });
  } catch (error) {
    console.error("Investment Error:", error);
    return NextResponse.json({ error: 'Failed to log investment' }, { status: 500 });
  }
}