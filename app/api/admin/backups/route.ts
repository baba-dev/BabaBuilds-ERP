import { NextResponse } from "next/server";
import { verifySuperAdmin, handleAdminApiError } from "../authz";
import fs from "node:fs/promises";
import path from "node:path";

// Never invoke privileged pg_dump through an HTTP request or create partial RLS dumps.
export async function GET() {
  try {
    await verifySuperAdmin();
    const directory = "/var/lib/bababuilds-erp/backup-metadata";
    let names: string[] = [];
    try {
      names = (await fs.readdir(directory)).filter(n => /^erp-[0-9TZ]+[.]json$/.test(n));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const files = await Promise.all(names.map(async filename => {
      const st = await fs.stat(path.join(directory, filename));
      return { filename, createdAt: st.mtime, size: st.size };
    }));
    return NextResponse.json(files.sort((a,b) => b.createdAt.getTime()-a.createdAt.getTime()));
  } catch (error) {
    return handleAdminApiError(error, "Failed to list backups");
  }
}
export async function POST() {
  try {
    await verifySuperAdmin();
    return NextResponse.json({
      code: "OPERATOR_BACKUP_REQUIRED",
      error: "PostgreSQL backups require the protected server backup operator."
    }, { status: 409 });
  } catch (error) {
    return handleAdminApiError(error, "Failed to authorize backup");
  }
}
