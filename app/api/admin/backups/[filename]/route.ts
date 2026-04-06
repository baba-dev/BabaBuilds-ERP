import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "@/app/api/admin/authz";
main
import fs from "fs";
import path from "path";

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
  } catch (error) {
    return handleAdminApiError(error, "Failed to download backup");
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
  } catch (error) {
    return handleAdminApiError(error, "Failed to delete backup");
  }
}
