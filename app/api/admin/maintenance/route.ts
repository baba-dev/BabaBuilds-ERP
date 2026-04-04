import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

// Security gate
async function verifySuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.email?.toLowerCase() !== "admin@bababuilds.com") {
    throw new Error("Unauthorized");
  }
}

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const { action } = await req.json();

    switch (action) {
      case "PURGE_DEMO":
        // Delete all users whose email ends with bababuilds.demo
        // Or if they are marked as guest/demo users
        const deletedUsers = await prisma.user.deleteMany({
          where: {
            email: {
              contains: "bababuilds.demo"
            }
          }
        });
        return NextResponse.json({ success: true, message: `Purged ${deletedUsers.count} demo accounts.` });

      case "PRUNE_FILES":
        let orphanedCount = 0;
        
        // 1. Collect all valid file paths from DB for O(1) lookup
        const [expenses, invoices, profiles] = await Promise.all([
          prisma.expense.findMany({ select: { receiptUrl: true }, where: { receiptUrl: { not: null } } }),
          prisma.invoice.findMany({ select: { pdfPath: true } }),
          prisma.businessProfile.findMany({ select: { logoUrl: true }, where: { logoUrl: { not: null } } })
        ]);

        const validPaths = new Set([
          ...expenses.map(e => e.receiptUrl),
          ...invoices.map(i => i.pdfPath),
          ...profiles.map(p => p.logoUrl)
        ].filter(Boolean) as string[]);

        // 2. Define target root directories
        const scanDirs = ['receipts', 'invoices', 'logos'];
        const publicRoot = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public');

        for (const dirName of scanDirs) {
          const dirPath = path.join(publicRoot, dirName);
          try {
            await fs.promises.access(dirPath);
          } catch {
            continue;
          }

          // Workspace-level subdirectories
          const workspaces = await fs.promises.readdir(dirPath);
          for (const workspaceId of workspaces) {
            const workspacePath = path.join(dirPath, workspaceId);
            const stats = await fs.promises.stat(workspacePath);
            if (!stats.isDirectory()) continue;

            const files = await fs.promises.readdir(workspacePath);
            for (const file of files) {
              const fullFilePath = path.join(workspacePath, file);
              const relativePath = `/${dirName}/${workspaceId}/${file}`;

              if (!validPaths.has(relativePath)) {
                try {
                  await fs.promises.unlink(fullFilePath);
                  orphanedCount++;
                  console.log(`🧹 Pruned orphaned file: ${relativePath}`);
                } catch (err) {
                  console.error(`Failed to delete orphaned file ${fullFilePath}:`, err);
                }
              }
            }
          }
        }
        
        return NextResponse.json({ 
          success: true, 
          message: `Scanned storage. Removed ${orphanedCount} orphaned files.` 
        });

      case "CLEAR_LOGS":
        // Clear .log files in the root dir
        let logsCleared = 0;
        const rootDir = process.cwd();
        const rootFiles = await fs.promises.readdir(/*turbopackIgnore: true*/ rootDir);
        for (const file of rootFiles) {
          if (file.endsWith(".log")) {
            await fs.promises.writeFile(path.join(/*turbopackIgnore: true*/ rootDir, file), "");
            logsCleared++;
          }
        }
        return NextResponse.json({ success: true, message: `Truncated ${logsCleared} system log files.` });

      case "CLEAR_CACHE":
        // Clear Next.js cache directory (.next/cache)
        const cacheDir = path.join(/*turbopackIgnore: true*/ process.cwd(), ".next", "cache");
        try {
          await fs.promises.access(cacheDir);
          await fs.promises.rm(cacheDir, { recursive: true, force: true });
          return NextResponse.json({ success: true, message: "Server output cache successfully cleared." });
        } catch {
          return NextResponse.json({ success: true, message: "No cache found to clear." });
        }

      case "STAMP_PAID_INVOICES":
        const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
        let stampedCount = 0;
        let notFoundCount = 0;
        let failedCount = 0;
        let dbUpdatedCount = 0;
        let missingFiles: string[] = [];
        
        // 1. Fetch all invoices marked as Paid (System-wide for Super Admin)
        const paidInvoices = await prisma.invoice.findMany({
          orderBy: { createdAt: 'desc' }
        });

        const targets = paidInvoices.filter(i => ['Paid', 'PAID'].includes(i.status as string));

        for (const inv of targets) {
          // --- 🔍 ROBUST PATH DISCOVERY (Fuzzy Matcher) ---
          let relativePath = inv.pdfPath.startsWith('/') ? inv.pdfPath.substring(1) : inv.pdfPath;
          let fullPdfPath  = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePath);
          
          let fileExists = fs.existsSync(fullPdfPath);
          let foundViaSanitized = false;

          // Attempt Fuzzy Matching if original path fails (Essential for Linux/VPS vs Windows sync)
          if (!fileExists) {
             const pathParts = inv.pdfPath.split('/');
             const filename  = pathParts[pathParts.length - 1]; // e.g. 013.pdf
             const parent    = pathParts.slice(0, -1).join('/'); // e.g. /invoices/workspaceId/INV/25-26
             
             // The system now uses underscores for the entire invoice number in the filename
             const sanitizedFilename = (inv.invoiceNumber || "").replace(/\//g, '_') + ".pdf";
             const sanitizedRelative = `invoices/${inv.workspaceId}/${sanitizedFilename}`;
             const sanitizedFull     = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', sanitizedRelative);
             
             if (fs.existsSync(sanitizedFull)) {
                 fullPdfPath = sanitizedFull;
                 relativePath = sanitizedRelative;
                 fileExists = true;
                 foundViaSanitized = true;
             }
          }

          if (fileExists) {
            try {
              const existingPdfBytes = fs.readFileSync(fullPdfPath);
              const pdfDoc = await PDFDocument.load(existingPdfBytes);
              
              // Embed font
              const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
              const pages = pdfDoc.getPages();
              
              const stampDate = inv.dateReceived || inv.invoiceDate || new Date();
              const formattedDate = new Date(stampDate).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
              }).toUpperCase();

              pages.forEach(page => {
                const { width, height } = page.getSize();
                page.drawText('PAID', {
                  x: width / 2 - 140, y: height / 2 - 50,
                  size: 130, font: fontBold,
                  color: rgb(0.85, 0.15, 0.15), opacity: 0.25,
                  rotate: degrees(45),
                });
                page.drawText(`RECEIVED: ${formattedDate}`, {
                  x: width / 2 - 110, y: height / 2 - 130,
                  size: 24, font: fontBold,
                  color: rgb(0.85, 0.15, 0.15), opacity: 0.25,
                  rotate: degrees(45),
                });
              });

              const pdfBytes = await pdfDoc.save();
              fs.writeFileSync(fullPdfPath, pdfBytes);
              stampedCount++;

              // --- 🛠️ SELF-HEALING DATABASE ---
              // If we found the file via the underscored path but the DB still has slashes, fix the DB.
              if (foundViaSanitized) {
                await prisma.invoice.update({
                  where: { id: inv.id },
                  data: { pdfPath: `/${relativePath}` }
                });
                dbUpdatedCount++;
              }
            } catch (err) {
              console.error(`Failed to stamp invoice ${inv.invoiceNumber}:`, err);
              failedCount++;
            }
          } else {
            notFoundCount++;
            missingFiles.push(`${inv.invoiceNumber} -> ${inv.pdfPath}`);
          }
        }
        return NextResponse.json({ 
          success: true, 
          message: `Process Complete.`,
          report: {
              totalFoundInDb: targets.length,
              stampedSuccessfully: stampedCount,
              dbPathsHealed: dbUpdatedCount,
              filesMissingOnDisk: notFoundCount,
              processingFailures: failedCount,
              missingSample: missingFiles.slice(0, 5)
          }
        });

      case "REGENERATE_INVOICES":
        const { generateInvoicePDF } = await import('@/lib/pdf/generator');
        let successCount = 0;
        let failCount = 0;

        const allInvoices = await prisma.invoice.findMany();
        
        for (const inv of allInvoices) {
            try {
                const profile = await prisma.businessProfile.findUnique({
                    where: { workspaceId: inv.workspaceId },
                    include: { workspace: true }
                });
                const client = await prisma.client.findUnique({
                  where: { id: inv.clientId as string }
                });

                if (!profile || !client) continue;

                const userLocale = profile.workspace?.countryCode === 'IN' ? 'en-IN' : 'en-US';
                const formattedTotal = inv.totalAmount.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const dueDate = new Date(inv.invoiceDate);
                dueDate.setDate(dueDate.getDate() + 7);

                const pdfBytes = await generateInvoicePDF({
                    profile,
                    client,
                    invoiceNumber: inv.invoiceNumber as string,
                    date: inv.invoiceDate,
                    dueDate,
                    billingMonth: inv.billingMonth,
                    sacCode: inv.sacCode,
                    services: [{ title: inv.serviceDescription as string, amount: inv.totalAmount, nicDetails: 'Service' }],
                    totalAmount: inv.totalAmount,
                    formattedTotal,
                    baseCurrency: profile.workspace?.baseCurrency || 'INR',
                    userLocale,
                    status: inv.status ?? undefined,
                    paymentLink: null
                });

                let relativePath = inv.pdfPath.startsWith('/') ? inv.pdfPath.substring(1) : inv.pdfPath;
                const fullPath = path.join(process.cwd(), 'public', relativePath);
                
                if (!fs.existsSync(path.dirname(fullPath))) {
                  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                }
                fs.writeFileSync(fullPath, pdfBytes);
                successCount++;
            } catch (err) {
                console.error(`Failed to regenerate ${inv.invoiceNumber}:`, err);
                failCount++;
            }
        }
        return NextResponse.json({ success: true, message: `Task complete. Regenerated ${successCount} invoices. ${failCount} failed.` });

      case "REBOOT":
        // In Edge/Serverless this does nothing, but on a VPS with PM2/Docker,
        // exiting the process forces the process manager to reboot the app.
        setTimeout(() => {
          process.exit(1);
        }, 1000);
        return NextResponse.json({ success: true, message: "Reboot signal sent. Application restarting..." });

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

  } catch (error: any) {
    console.error("Maintenance Error:", error);
    return NextResponse.json({ error: error.message || "Action failed" }, { status: 500 });
  }
}
