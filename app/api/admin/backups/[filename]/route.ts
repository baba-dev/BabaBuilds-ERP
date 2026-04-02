import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";

// Security gate
async function verifySuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.email?.toLowerCase() !== "admin@bababuilds.com") {
    throw new Error("Unauthorized");
  }
}

const BACKUP_DIR = path.join(process.cwd(), "backups");

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    await verifySuperAdmin();
    const { filename } = await params;
    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }

    const fileStream = fs.readFileSync(filePath);
    return new Response(fileStream, {
        headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    await verifySuperAdmin();
    const { filename } = await params;
    const filePath = path.join(BACKUP_DIR, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return NextResponse.json({ success: true, message: "Backup deleted successfully" });
    } else {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
