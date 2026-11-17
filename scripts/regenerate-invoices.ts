import { createPrismaClient } from '../lib/prisma-client';
import fs from 'fs';
import path from 'path';
import { generateInvoicePDF } from '../lib/pdf/generator';
import { calculateInvoiceTotals } from '../lib/invoice/totals';
import { decimalToNumber } from '../lib/money';

const prisma = createPrismaClient();

async function main() {
  console.log('--- 🚀 Starting Invoice Regeneration Utility ---');

  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${invoices.length} invoices to regenerate.`);

  for (const invoice of invoices) {
    try {
      console.log(`Processing ${invoice.invoiceNumber}...`);

      const profile = await prisma.businessProfile.findUnique({
        where: { workspaceId: invoice.workspaceId },
        include: { workspace: true }
      });

      if (!profile) {
        console.warn(`      ⚠️ No profile found for workspace ${invoice.workspaceId}. Skipping.`);
        continue;
      }

      const client = await prisma.client.findUnique({
        where: { id: invoice.clientId as string }
      });

      if (!client) {
        console.warn(`      ⚠️ No client found for ID ${invoice.clientId}. Skipping.`);
        continue;
      }

      // Prepare data
      const invoiceWithTotals = invoice as any;
      const services = typeof invoice.serviceDescription === 'string' 
        ? [{ title: invoice.serviceDescription, amount: decimalToNumber(invoiceWithTotals.subtotal ?? invoice.totalAmount), nicDetails: 'Service' }]
        : []; 
      
      // Note: Historical invoices might not have full service breakdown in DB, 
      // but we use totalAmount and description as fallback.
      
      const userLocale = profile.workspace?.countryCode === 'IN' ? 'en-IN' : 'en-US';
      const fallbackTotals = calculateInvoiceTotals({
        services: [{ amount: decimalToNumber(invoice.totalAmount) }],
        isTaxExempt: Boolean(client.isExport),
      });
      const totals = {
        subtotal: decimalToNumber(invoiceWithTotals.subtotal ?? fallbackTotals.subtotal),
        taxRate: invoiceWithTotals.taxRate ?? fallbackTotals.taxRate,
        taxAmount: decimalToNumber(invoiceWithTotals.taxAmount ?? fallbackTotals.taxAmount),
        total: decimalToNumber(invoiceWithTotals.grandTotal ?? invoice.totalAmount ?? fallbackTotals.total),
        taxMode: (invoiceWithTotals.taxMode as 'taxable' | 'exempt') ?? fallbackTotals.taxMode,
      };
      const formattedTotal = totals.total.toLocaleString(userLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      
      const dueDate = new Date(invoice.invoiceDate);
      dueDate.setDate(dueDate.getDate() + 7);

      const pdfBytes = await generateInvoicePDF({
        profile,
        client,
        invoiceNumber: invoice.invoiceNumber as string,
        date: invoice.invoiceDate,
        dueDate,
        billingMonth: invoice.billingMonth,
        sacCode: invoice.sacCode,
        services: services,
        totals,
        formattedTotal,
        baseCurrency: profile.workspace?.baseCurrency || 'INR',
        userLocale,
        status: invoice.status ?? undefined,
        paymentLink: null // Link regeneration not handled here for safety
      });

      // Path resolution
      let relativePath = invoice.pdfPath.startsWith('/') ? invoice.pdfPath.substring(1) : invoice.pdfPath;
      const fullPath = path.join(process.cwd(), 'public', relativePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(fullPath, pdfBytes);
      console.log(`      ✅ Regenerated: ${fullPath}`);

    } catch (err) {
      console.error(`      ❌ Failed to regenerate ${invoice.invoiceNumber}:`, err);
    }
  }

  console.log('\n--- 🎊 Regeneration Complete! ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
