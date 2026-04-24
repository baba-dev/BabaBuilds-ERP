import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
import { decimalToNumber } from "@/lib/money";
import { sendActivityAlert } from '@/lib/security/alert-hooks';
import { buildPrivatePath, ensureDir, getPrivateUploadsRoot } from '@/lib/uploads/private-storage';

const execPromise = util.promisify(exec);

export async function POST(req: Request) {
  try {
    await verifySuperAdmin();
    const { action } = await req.json();

    if (['PURGE_DEMO', 'PRUNE_FILES', 'CLEAR_LOGS', 'CLEAR_CACHE', 'STAMP_PAID_INVOICES', 'REGENERATE_INVOICES', 'REBOOT'].includes(action)) {
      await sendActivityAlert({
        type: 'MASS_MAINTENANCE_ACTION',
        severity: 'warning',
        message: `Super-admin initiated maintenance action: ${action}.`,
        details: { action },
        dedupeKey: `maintenance:${action}`
      });
    }

    switch (action) {
      case "PURGE_DEMO":
        // Delete all users whose email ends with bababuilds.demo
        // Or if they are marked as guest/demo users
        const deletedUsers = await prisma.user.deleteMany({
          where: {
            OR: [
              { isDemo: true },
              {
                email: {
                  contains: "bababuilds.demo",
                },
              },
            ],
          }
        });
        return NextResponse.json({ success: true, message: `Purged ${deletedUsers.count} demo accounts.` });

      case "PRUNE_FILES":
        let orphanedCount = 0;
        
        // 1. Collect all valid file paths from DB for O(1) lookup
        const [expenses, invoices, profiles, clients, products, services] = await Promise.all([
          prisma.expense.findMany({ select: { receiptUrl: true }, where: { receiptUrl: { not: null } } }),
          prisma.invoice.findMany({ select: { pdfPath: true } }),
          prisma.businessProfile.findMany({
            select: { logoUrl: true, signatureUrl: true },
            where: { OR: [{ logoUrl: { not: null } }, { signatureUrl: { not: null } }] }
          }),
          prisma.client.findMany({ select: { logoUrl: true }, where: { logoUrl: { not: null } } }),
          prisma.product.findMany({ select: { imageUrl: true }, where: { imageUrl: { not: null } } }),
          prisma.serviceTemplate.findMany({ select: { imageUrl: true }, where: { imageUrl: { not: null } } }),
        ]);

        const validPaths = new Set([
          ...expenses.map(e => e.receiptUrl),
          ...invoices.map(i => i.pdfPath),
          ...profiles.map(p => p.logoUrl),
          ...profiles.map(p => p.signatureUrl),
          ...clients.map(c => c.logoUrl),
          ...products.map(p => p.imageUrl),
          ...services.map(s => s.imageUrl),
        ].filter(Boolean) as string[]);

        const privateRoot = getPrivateUploadsRoot();
        await ensureDir(privateRoot);

        // 2. Define target private directories (workspace-namespaced)
        const scanKinds = ['receipts', 'invoices', 'logos', 'signatures', 'products', 'service-hero'];

        for (const kind of scanKinds) {
          const dirPath = path.join(privateRoot, kind);
          try {
            await fs.promises.access(dirPath);
          } catch {
            continue;
          }

          const workspaces = await fs.promises.readdir(dirPath);
          for (const workspaceId of workspaces) {
            const workspacePath = path.join(dirPath, workspaceId);
            let stats: fs.Stats;
            try {
              stats = await fs.promises.stat(workspacePath);
            } catch {
              continue;
            }
            if (!stats.isDirectory()) continue;

            const files = await fs.promises.readdir(workspacePath);
            for (const file of files) {
              const fullFilePath = path.join(workspacePath, file);
              const relativePath =
                kind === 'service-hero'
                  ? `/uploads/service-hero/${workspaceId}/${file}`
                  : `/${kind}/${workspaceId}/${file}`;

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

        // 3. Best-effort cleanup for share-target uploads older than 30 days.
        // These are staged imports and not yet modeled in the DB.
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const shareTargetRoot = path.join(privateRoot, 'share-target');
        try {
          const workspaceDirs = await fs.promises.readdir(shareTargetRoot);
          for (const workspaceId of workspaceDirs) {
            const wsRoot = path.join(shareTargetRoot, workspaceId);
            let wsStats: fs.Stats;
            try {
              wsStats = await fs.promises.stat(wsRoot);
            } catch {
              continue;
            }
            if (!wsStats.isDirectory()) continue;

            const uploadIds = await fs.promises.readdir(wsRoot);
            for (const uploadId of uploadIds) {
              const uploadPath = path.join(wsRoot, uploadId);
              let uploadStats: fs.Stats;
              try {
                uploadStats = await fs.promises.stat(uploadPath);
              } catch {
                continue;
              }
              if (!uploadStats.isDirectory()) continue;
              if (uploadStats.mtimeMs > cutoff) continue;

              try {
                await fs.promises.rm(uploadPath, { recursive: true, force: true });
                orphanedCount++;
                console.log(`🧹 Pruned share-target upload folder: /uploads/share-target/${workspaceId}/${uploadId}`);
              } catch (err) {
                console.error(`Failed to delete share-target folder ${uploadPath}:`, err);
              }
            }
          }
        } catch {
          // ignore if share-target doesn't exist
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
        const missingFiles: string[] = [];
        
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
        const { calculateInvoiceTotals } = await import('@/lib/invoice/totals');
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
                const fallbackTotals = calculateInvoiceTotals({
                  services: [{ amount: decimalToNumber(inv.totalAmount) }],
                  isTaxExempt: Boolean(client.isExport),
                });
                const invoiceWithTotals = inv as any;
                const totals = {
                  subtotal: decimalToNumber(invoiceWithTotals.subtotal ?? fallbackTotals.subtotal),
                  taxRate: invoiceWithTotals.taxRate ?? fallbackTotals.taxRate,
                  taxAmount: decimalToNumber(invoiceWithTotals.taxAmount ?? fallbackTotals.taxAmount),
                  total: decimalToNumber(invoiceWithTotals.grandTotal ?? inv.totalAmount ?? fallbackTotals.total),
                  taxMode: (invoiceWithTotals.taxMode as 'taxable' | 'exempt') ?? fallbackTotals.taxMode,
                };
                const formattedTotal = totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
                    services: [{ title: inv.serviceDescription as string, amount: totals.subtotal, nicDetails: 'Service' }],
                    totals,
                    formattedTotal,
                    baseCurrency: profile.workspace?.baseCurrency || 'INR',
                    userLocale,
                    status: inv.status ?? undefined,
                    paymentLink: null
                });

                const relativePath = inv.pdfPath.startsWith('/') ? inv.pdfPath.substring(1) : inv.pdfPath;
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

  } catch (error) {
    return handleAdminApiError(error, "Action failed");
  }
}
