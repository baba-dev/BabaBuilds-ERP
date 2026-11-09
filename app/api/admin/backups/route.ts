import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import os from "os";
import { prisma } from "@/lib/prisma";
import { getPrivateUploadsRoot } from "@/lib/uploads/private-storage";
import { logActivity } from "@/lib/security/activity-log";

const BACKUP_DIR = path.join(process.cwd(), "backups");


// Ensure backup directory exists
async function ensureBackupDir() {
  try {
    await fs.promises.access(BACKUP_DIR);
  } catch {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  }
}

export async function GET() {
  try {
    await verifySuperAdmin();
    await ensureBackupDir();

    const files = await fs.promises.readdir(BACKUP_DIR);
    const backupFiles = await Promise.all(
      files
        .filter(file => file.endsWith(".zip"))
        .map(async file => {
          const stats = await fs.promises.stat(path.join(BACKUP_DIR, file));
          return {
            filename: file,
            size: stats.size,
            createdAt: stats.mtime,
          };
        })
    );

    return NextResponse.json(backupFiles.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
  } catch (error) {
    return handleAdminApiError(error, "Failed to list backups");
  }
}

export async function POST() {
  try {
    const admin = await verifySuperAdmin();
    await ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `ERP_BACKUP_${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    const zip = new JSZip();

    // 1. A consistent database snapshot. Copying a live SQLite file can capture it mid-write, so take a snapshot first.
    const snapshotPath = path.join(os.tmpdir(), `erp-snapshot-${Date.now()}.db`);
    let dbIncluded = false;
    try {
      await prisma.$executeRawUnsafe(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
      zip.file("database/erp.db", fs.createReadStream(snapshotPath));
      dbIncluded = true;
    } catch (error) {
      console.error("Backup: database snapshot failed", error);
    }

    // 2. Uploaded files. They live in private storage (PRIVATE_UPLOADS_DIR or ./private_uploads); the old backup only
    // looked in public/ and so missed invoices, receipts, logos and documents.
    let uploadsIncluded = false;
    try {
      const root = getPrivateUploadsRoot();
      await fs.promises.access(root);
      await addFolderToZip(zip, root, "uploads");
      uploadsIncluded = true;
    } catch {
      // No uploads yet.
    }
    for (const dir of ["invoices", "logos", "receipts"]) {
      const legacy = path.join(process.cwd(), "public", dir);
      try {
        await fs.promises.access(legacy);
        await addFolderToZip(zip, legacy, `legacy-public/${dir}`);
      } catch {
        // Skip if directory missing
      }
    }
    if (!dbIncluded) {
      return NextResponse.json({ error: "The database snapshot failed, so no backup was written. Check the server log.", code: "SNAPSHOT_FAILED" }, { status: 500 });
    }
    zip.file("manifest.json", JSON.stringify({ createdAt: new Date().toISOString(), database: dbIncluded, uploads: uploadsIncluded }, null, 2));

    // Generate ZIP as NodeBuffer and save
    const content = await zip.generateAsync({ 
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 } 
    });
    
    await fs.promises.writeFile(backupPath, content);
    await fs.promises.unlink(snapshotPath).catch(() => undefined);

    // 3. Prune old backups (Keep last 5)
    const files = await fs.promises.readdir(BACKUP_DIR);
    const allBackups = await Promise.all(
      files
        .filter(file => file.endsWith(".zip"))
        .map(async file => ({
          name: file,
          time: (await fs.promises.stat(path.join(BACKUP_DIR, file))).mtime.getTime()
        }))
    );
    
    allBackups.sort((a, b) => b.time - a.time);

    if (allBackups.length > 5) {
      const toDelete = allBackups.slice(5);
      for (const backup of toDelete) {
        await fs.promises.unlink(path.join(BACKUP_DIR, backup.name));
      }
    }

    await logActivity({ action: "admin_backup_created", status: "SUCCESS", workspaceId: null, actor: { userId: admin.userId, email: admin.email }, entity: { type: "backup", id: backupName }, metadata: { uploads: uploadsIncluded } });
    return NextResponse.json({ success: true, filename: backupName, uploads: uploadsIncluded });
  } catch (error) {
    return handleAdminApiError(error, "Failed to create backup");
  }
}

async function addFolderToZip(zip: JSZip, folderPath: string, zipPath: string) {
    const files = await fs.promises.readdir(folderPath);
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stats = await fs.promises.stat(fullPath);
        if (stats.isDirectory()) {
            await addFolderToZip(zip, fullPath, `${zipPath}/${file}`);
        } else {
            // Using createReadStream for memory efficiency
            zip.file(`${zipPath}/${file}`, fs.createReadStream(fullPath));
        }
    }
}
