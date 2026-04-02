import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from 'fs';
import path from 'path';
import { scanBuffer } from '@/lib/security/clamav';

// Fetch all expenses for the ledger (NOW PAGINATED)
export async function GET(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const whereClause = { workspaceId: workspaceId };

    // 2. GET PAGINATION PARAMS
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '15'); // Show 15 expenses per page
    const skip = (page - 1) * limit;

    // 3. FETCH PAGINATED DATA & TOTAL COUNT CONCURRENTLY
    const [expenses, totalExpenses] = await Promise.all([
      prisma.expense.findMany({
        where: whereClause,
        orderBy: { date: 'desc' },
        skip: skip,
        take: limit,
      }),
      prisma.expense.count({ where: whereClause })
    ]);
    
    // 4. RETURN STRUCTURED RESPONSE
    return NextResponse.json({
      data: expenses,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalExpenses / limit),
        totalRecords: totalExpenses,
      }
    });

  } catch (error) {
    console.error("API Error fetching expenses:", error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

// Log a new expense and securely save the uploaded receipt
export async function POST(request: Request) {
  try {
    // 1. SECURITY LOCK
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    const formData = await request.formData();
    
    // Extract text fields
    const date = formData.get('date') as string;
    const category = formData.get('category') as string;
    const vendor = formData.get('vendor') as string;
    const amount = formData.get('amount') as string;
    const description = formData.get('description') as string;
    
    // --- 🚨 SECURITY PATCH: Prevent NaN Poisoning & Invalid Dates ---
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json({ error: "Invalid amount. Must be a positive number." }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
    }
    // ----------------------------------------------------------------

    // Extract the file
    const file = formData.get('receipt') as File | null;
    let receiptUrl = null;

    // Prevent processing of empty/ghost files
    if (file && file.size > 0) {
      const ext = path.extname(file.name).toLowerCase();
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.pdf']; // PDFs are okay for receipts
      if (!allowedExtensions.includes(ext)) {
        return NextResponse.json({ error: "Invalid file type. Only images/PDFs are allowed." }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
      }

      // 2. NAMESPACED UPLOADS: Save to a workspace-specific folder
      const receiptsDir = path.join(process.cwd(), 'public', 'receipts', workspaceId);
      if (!fs.existsSync(receiptsDir)) fs.mkdirSync(receiptsDir, { recursive: true });

      const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const uniqueFilename = `${Date.now()}-${safeFilename}`;
      const filepath = path.join(receiptsDir, uniqueFilename);

      fs.writeFileSync(filepath, buffer);
      receiptUrl = `/receipts/${workspaceId}/${uniqueFilename}`;
    }

    // 3. SECURE CREATION: Link expense to the workspace
    const newExpense = await prisma.expense.create({
      data: {
        workspaceId: workspaceId,
        date: parsedDate,
        category,
        vendor,
        amount: parsedAmount,
        description: description || null,
        receiptUrl,
      }
    });

    return NextResponse.json({ success: true, expense: newExpense });

  } catch (error) {
    console.error('Expense logging error:', error);
    return NextResponse.json({ error: 'Failed to log expense and save receipt' }, { status: 500 });
  }
}