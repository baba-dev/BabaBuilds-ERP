import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch both global dictionaries concurrently for speed
    const [nicCodes, sacCodes] = await Promise.all([
      prisma.nICCode.findMany({ orderBy: { code: 'asc' } }),
      prisma.sACCode.findMany({ orderBy: { code: 'asc' } })
    ]);

    return NextResponse.json({ nic: nicCodes, sac: sacCodes });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tax codes' }, { status: 500 });
  }
}