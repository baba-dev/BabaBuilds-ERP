import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import fs from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), "backups");
const BACKUP_DIR_RESOLVED = path.resolve(BACKUP_DIR);
const SAFE_FILENAME_CHARS_REGEX = /^[A-Za-z0-9T:._-]+$/;
const BACKUP_FILENAME_REGEX = /^ERP_BACKUP_[0-9T:.-]+\.zip$/;

export function validateAndResolveBackupPath(filename: string) {
  if (
    !filename ||
    filename.includes("\0") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("..") ||
    !SAFE_FILENAME_CHARS_REGEX.test(filename) ||
    !BACKUP_FILENAME_REGEX.test(filename)
  ) {
    return { error: "Invalid filename format", status: 400 as const };
  }

  const resolvedPath = path.resolve(BACKUP_DIR, filename);
  const inBackupDir =
    resolvedPath === BACKUP_DIR_RESOLVED ||
    resolvedPath.startsWith(`${BACKUP_DIR_RESOLVED}${path.sep}`);

  if (!inBackupDir) {
    return { error: "Invalid filename format", status: 400 as const };
  }

  return { filePath: resolvedPath };
}

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
