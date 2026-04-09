import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isCronAuthorized, unauthorizedCronResponse } from '@/lib/security/cron-auth';

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return unauthorizedCronResponse();
  }

  try {
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
