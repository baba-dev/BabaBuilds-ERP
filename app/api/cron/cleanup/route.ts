import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK: CRON AUTHENTICATION
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Only enforce this in production; allows for easy browser testing in dev
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse("Unauthorized Cron Trigger", { status: 401 });
    }

    // 2. DEFINE THE PURGE WINDOW (24 Hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 3. EXECUTE THE PURGE
    // Note: This relies on 'onDelete: Cascade' in your schema.prisma
    // If cascade is set, deleting the Workspace automatically wipes all linked 
    // Invoices, Clients, Proposals, and Retainers.
    const deleted = await prisma.workspace.deleteMany({
      where: {
        name: "BabaBuilds Demo Enterprise",
        createdAt: { lt: twentyFourHoursAgo }
      }
    });

    console.log(`🧹 Cleanup Cron: Purged ${deleted.count} stale demo workspaces.`);

    return NextResponse.json({ 
      success: true, 
      message: "Old demos purged successfully.",
      purgedCount: deleted.count 
    });

  } catch (error) {
    console.error("Cleanup Cron Error:", error);
    return NextResponse.json({ error: "Failed to purge old demos" }, { status: 500 });
  }
}