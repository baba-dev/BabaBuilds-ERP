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
        const { PDFDocument: PDFDoc, rgb: RGB, degrees: DEGREES, StandardFonts: Fonts, PDFName: Name, PDFArray: Arr } = await import('pdf-lib');
        let stampedCount = 0;
        let notFoundCount = 0;
        let failedCount = 0;
        let dbUpdatedCount = 0;
        let missingFiles: string[] = [];
        
        const paidInvoices = await prisma.invoice.findMany({
          orderBy: { createdAt: 'desc' }
        });

        const targets = paidInvoices.filter(i => ['Paid', 'PAID'].includes(i.status as string));

        for (const inv of targets) {
          let relativePath = inv.pdfPath.startsWith('/') ? inv.pdfPath.substring(1) : inv.pdfPath;
          let fullPdfPath  = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePath);
          let fileExists = fs.existsSync(fullPdfPath);

          if (!fileExists) {
             const sanitizedFilename = (inv.invoiceNumber || "").replace(/\//g, '_') + ".pdf";
             const sanitizedRelative = `invoices/${inv.workspaceId}/${sanitizedFilename}`;
             const sanitizedFull     = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', sanitizedRelative);
             if (fs.existsSync(sanitizedFull)) {
                 fullPdfPath = sanitizedFull;
                 relativePath = sanitizedRelative;
                 fileExists = true;
             }
          }

          if (fileExists) {
            try {
              const existingPdfBytes = fs.readFileSync(fullPdfPath);
              const pdfDoc = await PDFDoc.load(existingPdfBytes);
              const fontBold = await pdfDoc.embedFont(Fonts.HelveticaBold);
              const pages = pdfDoc.getPages();
              
              const stampDate = inv.dateReceived || inv.invoiceDate || new Date();
              const formattedDate = new Date(stampDate).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
              }).toUpperCase();

              const cos45 = Math.cos(Math.PI / 4);
              const sin45 = Math.sin(Math.PI / 4);

              pages.forEach(page => {
                const { width, height } = page.getSize();
                const existingContents = page.node.get(Name.of('Contents'));
                page.node.delete(Name.of('Contents'));

                // PAID Watermark
                const xPaid = (width / 2) - (fontBold.widthOfTextAtSize('PAID', 130) / 2) * cos45 + (130 * 0.7 / 2) * sin45;
                const yPaid = (height / 2) - (fontBold.widthOfTextAtSize('PAID', 130) / 2) * sin45 - (130 * 0.7 / 2) * cos45;
                page.drawText('PAID', { x: xPaid, y: yPaid, size: 130, font: fontBold, color: RGB(0.85, 0.15, 0.15), opacity: 0.10, rotate: DEGREES(45) });

                // RECEIVED date
                const centerRecX = (width / 2) + 80 * sin45;
                const centerRecY = (height / 2) - 80 * cos45;
                const xRec = centerRecX - (fontBold.widthOfTextAtSize(`RECEIVED: ${formattedDate}`, 24) / 2) * cos45 + (24 * 0.7 / 2) * sin45;
                const yRec = centerRecY - (fontBold.widthOfTextAtSize(`RECEIVED: ${formattedDate}`, 24) / 2) * sin45 - (24 * 0.7 / 2) * cos45;
                page.drawText(`RECEIVED: ${formattedDate}`, { x: xRec, y: yRec, size: 24, font: fontBold, color: RGB(0.85, 0.15, 0.15), opacity: 0.10, rotate: DEGREES(45) });

                const watermarkContents = page.node.get(Name.of('Contents'));
                const finalContents = pdfDoc.context.obj([]);
                const append = (item: any) => {
                  if (item instanceof Arr) item.asArray().forEach(s => (finalContents as any).push(s));
                  else if (item) (finalContents as any).push(item);
                };
                append(watermarkContents);
                append(existingContents);
                page.node.set(Name.of('Contents'), finalContents);
              });

              const pdfBytes = await pdfDoc.save();
              fs.writeFileSync(fullPdfPath, pdfBytes);
              stampedCount++;

              if (relativePath !== inv.pdfPath.substring(1)) {
                await prisma.invoice.update({ where: { id: inv.id }, data: { pdfPath: `/${relativePath}` } });
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
          message: `Stamping Complete.`,
          report: { targets: targets.length, stamped: stampedCount, healed: dbUpdatedCount, missing: notFoundCount, failed: failedCount }
        });

      case "REGENERATE_INVOICES":
        const { renderInvoiceToBytes } = await import('@/lib/invoice-renderer');
        let regTotal = 0;
        let regSuccess = 0;
        let regFail = 0;

        const invoicesToRegen = await prisma.invoice.findMany({
          orderBy: { createdAt: 'desc' },
          include: { workspace: { include: { businessProfile: true } } }
        });

        for (const inv of invoicesToRegen) {
          regTotal++;
          try {
            const profile = inv.workspace.businessProfile;
            if (!profile) { regFail++; continue; }
            
            const client = await prisma.client.findUnique({ where: { id: inv.clientId || undefined } });
            if (!client) { regFail++; continue; }

            const userLocale = inv.workspace.countryCode === "IN" ? "en-IN" : "en-US";
            const baseCurrency = inv.workspace.baseCurrency || 'INR';
            const invoiceTheme = (profile as any).invoiceTheme || "DESIGN_1";
            const isFreePlan = inv.workspace.planTier === "FREE";

            let services = [];
            try { services = JSON.parse(inv.serviceDescription); }
            catch { services = [{ title: inv.serviceDescription, amount: inv.totalAmount, nicDetails: "Services" }]; }

            const pdfBytes = await renderInvoiceToBytes({
              profile,
              client,
              invoice: {
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                billingMonth: inv.billingMonth,
                totalAmount: inv.totalAmount,
                status: inv.status,
                dateReceived: inv.dateReceived
              },
              services,
              sacCode: inv.sacCode,
              theme: invoiceTheme as 'DESIGN_1' | 'DESIGN_2',
              isFreePlan,
              baseCurrency,
              userLocale
            });

            // Save using existing path
            let relativePath = inv.pdfPath.startsWith('/') ? inv.pdfPath.substring(1) : inv.pdfPath;
            const fullPath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePath);
            
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, pdfBytes);
            regSuccess++;
          } catch (e) {
            console.error(`Regen failed for ${inv.invoiceNumber}:`, e);
            regFail++;
          }
        }
        return NextResponse.json({ success: true, message: `Re-rendered ${regSuccess}/${regTotal} invoices with latest styles.` });

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
