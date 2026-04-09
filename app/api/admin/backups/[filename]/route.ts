import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import fs from "fs";
import { validateAndResolveBackupPath } from "../utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    await verifySuperAdmin();
    const { filename } = await params;
    const resolved = validateAndResolveBackupPath(filename);

    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!fs.existsSync(resolved.filePath)) {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }

    const fileStream = fs.readFileSync(resolved.filePath);
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
    const resolved = validateAndResolveBackupPath(filename);

    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    if (fs.existsSync(resolved.filePath)) {
      fs.unlinkSync(resolved.filePath);
      return NextResponse.json({ success: true, message: "Backup deleted successfully" });
    }

    return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to delete backup");
  }
}
