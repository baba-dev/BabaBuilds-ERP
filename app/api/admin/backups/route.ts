import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

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
            createdAt: stats.birthtime,
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
    await verifySuperAdmin();
    await ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `ERP_BACKUP_${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    const zip = new JSZip();

    // 1. Add Database (using stream for memory efficiency)
    const dbPath = path.join(process.cwd(), "prisma", "dev.db");
    try {
      await fs.promises.access(dbPath);
      // JSZip can take a node stream
      zip.file("database/dev.db", fs.createReadStream(dbPath));
    } catch {
      console.warn("Database file not found during backup.");
    }

    // 2. Add Uploads (Invoices, Logos, Receipts)
    const uploadDirs = ["invoices", "logos", "receipts"];
    const publicDir = path.join(process.cwd(), "public");

    for (const dir of uploadDirs) {
        const fullDirPath = path.join(publicDir, dir);
        try {
          await fs.promises.access(fullDirPath);
          await addFolderToZip(zip, fullDirPath, `uploads/${dir}`);
        } catch {
          // Skip if directory missing
        }
    }

    // Generate ZIP as NodeBuffer and save
    const content = await zip.generateAsync({ 
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 } 
    });
    
    await fs.promises.writeFile(backupPath, content);

    // 3. Prune old backups (Keep last 5)
    const files = await fs.promises.readdir(BACKUP_DIR);
    const allBackups = await Promise.all(
      files
        .filter(file => file.endsWith(".zip"))
        .map(async file => ({
          name: file,
          time: (await fs.promises.stat(path.join(BACKUP_DIR, file))).birthtime.getTime()
        }))
    );
    
    allBackups.sort((a, b) => b.time - a.time);

    if (allBackups.length > 5) {
      const toDelete = allBackups.slice(5);
      for (const backup of toDelete) {
        await fs.promises.unlink(path.join(BACKUP_DIR, backup.name));
      }
    }

    return NextResponse.json({ success: true, filename: backupName });
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
