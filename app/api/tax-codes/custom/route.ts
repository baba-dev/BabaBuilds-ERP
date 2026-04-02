import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { type, code, description, countryCode, igstRate } = await req.json();

    if (!type || !code || !description || !countryCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // --- Dynamic Validation ---
    const isIndian = countryCode === 'IN';
    const cleanCode = code.trim();
    
    let isValid = false;
    if (isIndian) {
      // SAC: 99xxxx (6 digits starting with 99), NIC: xxxxx (5 digits)
      if (type === 'SAC') {
        isValid = /^99[0-9]{4}$/.test(cleanCode);
      } else {
        isValid = /^[0-9]{5}$/.test(cleanCode);
      }
    } else {
      // Global: Alphanumeric 3-10 chars (NAICS/NACE/ISIC)
      isValid = /^[A-Z0-9.-]{3,10}$/i.test(cleanCode);
    }

    if (!isValid) {
      return NextResponse.json({ 
        error: `Invalid ${type === 'SAC' ? 'Tax' : 'Industry'} code format for ${countryCode}.` 
      }, { status: 400 });
    }

    // --- Database Operations ---
    if (type === 'SAC') {
      const existing = await prisma.sACCode.findUnique({ where: { code: cleanCode } });
      if (existing) return NextResponse.json({ error: 'Code already exists' }, { status: 409 });

      const newCode = await prisma.sACCode.create({
        data: {
          code: cleanCode,
          description,
          igstRate: igstRate || 18.0,
          countryCode,
          isCustom: true
        }
      });
      return NextResponse.json(newCode);
    } else {
      const existing = await prisma.nICCode.findUnique({ where: { code: cleanCode } });
      if (existing) return NextResponse.json({ error: 'Code already exists' }, { status: 409 });

      const newCode = await prisma.nICCode.create({
        data: {
          code: cleanCode,
          description,
          countryCode,
          isCustom: true
        }
      });
      return NextResponse.json(newCode);
    }

  } catch (error) {
    console.error("Custom tax-code error:", error);
    return NextResponse.json({ error: 'Failed to create custom code' }, { status: 500 });
  }
}
