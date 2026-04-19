import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Groq from 'groq-sdk';
import { decrypt } from '@/lib/encryption';
import nodemailer from 'nodemailer';
import dns from 'dns';
import { promisify } from 'util';
import { decimalToNumber, toDecimal } from '@/lib/money';
import { getRuntimeSmtpPassword } from '@/lib/mailer';
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import { chatRequestSchema, type ToolAction } from '@/lib/ai/chat/contracts';
import { canExecuteToolForRole } from '@/lib/ai/chat/tool-policy';
import { assertFreeTierMonthlyInvoiceAllowed } from '@/lib/entitlements';
import { canExecuteToolForRole, canUseReportingTools } from '@/lib/ai/chat/tool-policy';
import { REPORT_PRESETS } from '@/lib/reporting/presets';
import { isModuleEnabled } from '@/lib/modules';

const lookupAsync = promisify(dns.lookup);

function isProbablyGroqKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Groq keys typically look like `gsk_...` (per docs + UI help text).
  if (!trimmed.startsWith("gsk_")) return false;
  // Block known demo placeholder keys so we fail fast with an actionable message.
  if (trimmed.includes("demo_bypass_key_placeholder")) return false;
  return true;
}

function groqErrorToHttp(error: any): { status: number; code: string; message: string } {
  const status = Number(error?.status) || Number(error?.response?.status) || 0;
  const upstreamCode =
    error?.error?.code ||
    error?.code ||
    error?.name ||
    error?.type ||
    "unknown_error";

  // Invalid/unauthorized key.
  if (status === 401 || upstreamCode === "invalid_api_key") {
    return {
      status: 400,
      code: "GROQ_API_KEY_INVALID",
      message:
        "Your Groq API key is invalid or expired. Update it in **Settings → AI Assistant** (`/settings`).",
    };
  }

  // Rate limiting from Groq.
  if (status === 429 || upstreamCode === "rate_limit_exceeded" || upstreamCode === "RateLimitError") {
    return {
      status: 429,
      code: "GROQ_RATE_LIMITED",
      message: "The AI provider is rate-limiting requests. Please wait a moment and try again.",
    };
  }

  // Timeouts / connectivity.
  if (upstreamCode === "APIConnectionTimeoutError") {
    return {
      status: 504,
      code: "GROQ_TIMEOUT",
      message: "The AI request timed out. Please try again.",
    };
  }
  if (upstreamCode === "APIConnectionError") {
    return {
      status: 502,
      code: "GROQ_CONNECTION_ERROR",
      message: "Could not reach the AI provider. Please try again.",
    };
  }

  // Other upstream errors.
  if (status >= 500) {
    return {
      status: 502,
      code: "GROQ_UPSTREAM_ERROR",
      message: "The AI provider returned an error. Please try again shortly.",
    };
  }

  return {
    status: 500,
    code: "AI_UNKNOWN_ERROR",
    message: "Failed to communicate with the AI. Please try again later.",
  };
}

async function resolveSafeIp(host: string): Promise<string | null> {
  try {
    if (host.toLowerCase() === 'localhost') return null;
    const { address } = await lookupAsync(host);
    if (address.startsWith('127.')) return null;
    if (address.startsWith('10.')) return null;
    if (address.startsWith('192.168.')) return null;
    if (address.startsWith('169.254.')) return null;
    if (address === '0.0.0.0') return null;
    if (address.startsWith('172.')) {
      const secondOctet = parseInt(address.split('.')[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return null;
    }
    if (address === '::1') return null;
    if (address.toLowerCase().startsWith('fe80:')) return null;
    return address;
  } catch (e) {
    return null;
  }
}

// --- THE TOOLBOX (Database Functions - Workspace Aware) ---

async function lookupInvoiceDetails(invoiceNumber: string, workspaceId: string) {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { 
        invoiceNumber: { contains: invoiceNumber },
        workspaceId: workspaceId // SECURITY LOCK
      }
    });
    if (!invoice) return JSON.stringify({ error: `Could not find invoice matching ${invoiceNumber}.` });
    return JSON.stringify({
      invoiceNumber: invoice.invoiceNumber, clientName: invoice.clientName,
      date: invoice.invoiceDate, totalAmount: `₹${invoice.totalAmount}`,
      servicesRendered: invoice.serviceDescription, financialYear: invoice.financialYear
    });
  } catch (e) { return JSON.stringify({ error: "Database error." }); }
}

async function getClientSummary(clientName: string, workspaceId: string) {
  try {
    const client = await prisma.client.findFirst({
      where: { 
        name: { contains: clientName },
        workspaceId: workspaceId // SECURITY LOCK
      }
    });
    if (!client) return JSON.stringify({ error: `Could not find client matching ${clientName} in CRM.` });

    const invoiceStats = await prisma.invoice.aggregate({
      where: { clientId: client.id, workspaceId: workspaceId },
      _sum: { totalAmount: true },
      _count: true
    });
    
    const recentInvoices = await prisma.invoice.findMany({
      where: { clientId: client.id, workspaceId: workspaceId },
      orderBy: { invoiceDate: 'desc' },
      take: 2,
      select: { invoiceNumber: true }
    });
    
    return JSON.stringify({
      clientName: client.name, country: client.country, isExport: client.isExport,
      totalInvoicesGenerated: invoiceStats._count, 
      totalLifetimeValue: `₹${invoiceStats._sum.totalAmount || 0}`,
      recentInvoices: recentInvoices.map(i => i.invoiceNumber)
    });
  } catch (e) { return JSON.stringify({ error: "Database error." }); }
}

async function getTaxSummary(workspaceId: string) {
  try {
    const investments = await prisma.investment.findMany({
      where: { workspaceId: workspaceId },
      select: { category: true, amount: true } 
    });
    const section80C = decimalToNumber(investments.filter(i => i.category.includes('80C')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    const section80D = decimalToNumber(investments.filter(i => i.category.includes('80D')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0)));
    
    return JSON.stringify({
      section80C_Total: `₹${section80C}`, section80C_Limit: "₹1,50,000", section80C_Remaining: `₹${Math.max(0, 150000 - section80C)}`,
      section80D_Total: `₹${section80D}`, section80D_Limit: "₹25,000"
    });
  } catch (e) { return JSON.stringify({ error: "Database error." }); }
}

async function getServiceCatalog(workspaceId: string) {
  try {
    const catalog = await prisma.serviceTemplate.findMany({
      where: { workspaceId: workspaceId },
      select: { name: true, defaultPrice: true, description: true }
    });
    return JSON.stringify(catalog);
  } catch (e) { return JSON.stringify({ error: "Database error." }); }
}

async function getProposals(workspaceId: string, status?: string) {
  try {
    const query: any = { workspaceId: workspaceId };
    if (status) query.status = status.toUpperCase();

    const proposals = await prisma.proposal.findMany({
      where: query,
      include: { client: { select: { name: true } } },
      orderBy: { dateCreated: 'desc' },
      take: 10 
    });
    
    const mappedProposals = proposals.map(p => ({
      quoteNumber: p.proposalNo,
      client: p.client?.name,
      title: p.title,
      status: p.status,
      totalAmount: `₹${p.totalAmount}`,
      expires: p.validUntil
    }));
    return JSON.stringify(mappedProposals);
  } catch (e) { return JSON.stringify({ error: "Database error." }); }
}

// +++ ENHANCEMENT 2: THE "CREATE" TOOL +++
async function createTask(title: string, description: string, dueDate: string | undefined, workspaceId: string) {
  try {
    // Note: This assumes you have a Task or Reminder model in schema.prisma.
    // If you haven't added it yet, the catch block will gracefully tell the AI it failed.
    const task = await (prisma as any).task.create({
      data: {
        title,
        description: description || "",
        dueDate: dueDate ? new Date(dueDate) : null,
        workspaceId,
        status: "PENDING"
      }
    });
    return JSON.stringify({ success: true, taskId: task.id, message: `Task '${title}' created successfully.` });
  } catch (e) { 
    console.error("Task creation error:", e);
    return JSON.stringify({ error: "Could not create task. Instruct user to ensure the Task module is enabled." }); 
  }
}

// +++ NEW INVOICING AUTOMATION TOOLS +++
async function getOverdueInvoices(workspaceId: string) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const overdue = await prisma.invoice.findMany({
      where: {
        workspaceId,
        status: "PENDING",
        invoiceDate: { lt: thirtyDaysAgo }
      },
      select: { invoiceNumber: true, clientName: true, totalAmount: true, invoiceDate: true },
      orderBy: { invoiceDate: 'asc' },
      take: 10
    });
    
    if (overdue.length === 0) return JSON.stringify({ message: "No overdue invoices found. Excellent!" });
    
    return JSON.stringify({
      count: overdue.length,
      invoices: overdue.map(i => ({
        invoiceNumber: i.invoiceNumber,
        client: i.clientName,
        amount: `₹${i.totalAmount}`,
        daysOverdue: Math.floor((new Date().getTime() - i.invoiceDate.getTime()) / (1000 * 3600 * 24))
      }))
    });
  } catch (e) { return JSON.stringify({ error: "Database error picking up overdue invoices." }); }
}

async function markInvoicePaid(invoiceNumber: string, workspaceId: string) {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber, workspaceId }
    });
    
    if (!invoice) return JSON.stringify({ error: `Invoice ${invoiceNumber} not found.` });
    if (String(invoice.status).toUpperCase() === "PAID") return JSON.stringify({ message: `Invoice ${invoiceNumber} is already marked as paid.` });

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "PAID",
        amountReceived: Number(invoice.totalAmount),
        dateReceived: new Date()
      }
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'payment', error: String(error) });
    }
    
    return JSON.stringify({ success: true, message: `Reconciliation complete. Successfully marked Invoice ${invoiceNumber} as paid.` });
  } catch (e) { return JSON.stringify({ error: "Failed to update invoice in database." }); }
}

async function sendInvoiceReminder(invoiceNumber: string, workspaceId: string) {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber, workspaceId },
      include: { client: true }
    });

    if (!invoice) return JSON.stringify({ error: `Invoice ${invoiceNumber} not found.` });
    const email = invoice.client?.email;
    if (!email) return JSON.stringify({ error: `No email address found for client ${invoice.clientName}. Cannot send reminder.` });

    // Fetch SMTP settings from the workspace's BusinessProfile
    const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
    if (!profile || !profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
      return JSON.stringify({ error: 'SMTP server is not configured. Please add SMTP settings in Business Settings to send reminders.' });
    }

    // SSRF protection: resolve host to a safe public IP before connecting
    const safeIp = await resolveSafeIp(profile.smtpHost);
    if (!safeIp) {
      console.error(`[AI Reminder] Blocked SSRF attempt on SMTP host: ${profile.smtpHost}`);
      return JSON.stringify({ error: 'Invalid or internal SMTP host blocked by security policy.' });
    }

    const transporter = nodemailer.createTransport({
      host:   safeIp,
      port:   profile.smtpPort || 587,
      secure: profile.smtpPort === 465,
      tls:    { servername: profile.smtpHost },
      auth:   { user: profile.smtpUser, pass: getRuntimeSmtpPassword(profile.smtpPassword) },
    });

    const formattedAmount = decimalToNumber(invoice.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    await transporter.sendMail({
      from:    `"${profile.companyName}" <${profile.smtpFromEmail || profile.smtpUser}>`,
      to:      email,
      subject: `Payment Reminder: Invoice ${invoiceNumber} from ${profile.companyName}`,
      text: `Dear ${invoice.client?.name || invoice.clientName},\n\nThis is a friendly reminder that Invoice ${invoiceNumber} for INR ${formattedAmount} is currently outstanding.\n\nPlease arrange payment at your earliest convenience.\n\nBest Regards,\n${profile.companyName}`,
    });

    return JSON.stringify({
      success: true,
      message: `Payment reminder email successfully sent to ${invoice.clientName} (${email}) for Invoice ${invoiceNumber}.`
    });
  } catch (e: any) {
    console.error('[AI Reminder] Send failed:', e);
    return JSON.stringify({ error: `Failed to send reminder email: ${e?.message || 'Unknown error'}` });
  }
}

// +++ NEW CRM AUTOMATION TOOLS +++
async function createClient(name: string, email: string | undefined, taxId: string | undefined, address: string, country: string, workspaceId: string) {
  try {
    const existing = await prisma.client.findFirst({ where: { name, workspaceId } });
    if (existing) return JSON.stringify({ error: `Client ${name} already exists.` });

    const client = await prisma.client.create({
      data: { name, address: address || "Unknown", country: country || "Unknown", email, taxId, workspaceId }
    });
    return JSON.stringify({ success: true, message: `Successfully created client ${client.name}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to create client in database." }); }
}

async function updateClientStatus(clientName: string, status: string, workspaceId: string) {
  try {
    const client = await prisma.client.findFirst({ where: { name: { contains: clientName }, workspaceId } });
    if (!client) return JSON.stringify({ error: `Could not find a client matching ${clientName}.` });

    const validStatuses = ['ACTIVE', 'INACTIVE', 'VIP'];
    const normalizedStatus = status.toUpperCase();
    if (!validStatuses.includes(normalizedStatus)) {
      return JSON.stringify({ error: `Invalid status '${status}'. Must be one of: ACTIVE, INACTIVE, VIP.` });
    }

    await prisma.client.update({
      where: { id: client.id },
      data: { status: normalizedStatus }
    });
    return JSON.stringify({ success: true, message: `Updated ${client.name} status to ${normalizedStatus}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to update client status." }); }
}

async function searchClients(query: string, workspaceId: string) {
  try {
    const clients = await prisma.client.findMany({
      where: {
        workspaceId,
        OR: [
          { name: { contains: query } },
          { email: { contains: query } }
        ]
      },
      take: 5
    });
    if (clients.length === 0) return JSON.stringify({ message: `No clients found matching "${query}".` });
    return JSON.stringify(clients.map((c: any) => ({ name: c.name, email: c.email, status: c.status, country: c.country })));
  } catch (e) { return JSON.stringify({ error: "Search failed." }); }
}

async function getClientLedger(clientName: string, workspaceId: string) {
  try {
    const client = await prisma.client.findFirst({
      where: { name: { contains: clientName }, workspaceId },
      include: {
        invoices: { orderBy: { invoiceDate: 'desc' }, take: 5, select: { invoiceNumber: true, totalAmount: true, status: true } },
        retainers: { select: { serviceName: true, amount: true, status: true } },
        proposals: { orderBy: { dateCreated: 'desc' }, take: 3, select: { title: true, status: true, totalAmount: true } }
      }
    });
    if (!client) return JSON.stringify({ error: `Could not find client matching ${clientName}.` });
    return JSON.stringify({
      client: client.name,
      status: (client as any).status,
      recentInvoices: client.invoices,
      activeRetainers: client.retainers,
      recentProposals: client.proposals
    });
  } catch (e) { return JSON.stringify({ error: "Failed to fetch client ledger." }); }
}

// +++ NEW EXPENSES & RECONCILIATION TOOLS +++
async function logExpense(vendor: string, amount: number, category: string, description: string | undefined, dateString: string | undefined, workspaceId: string) {
  try {
    const expense = await prisma.expense.create({
      data: {
        workspaceId,
        vendor,
        amount,
        category: category || "Uncategorized",
        description,
        date: dateString ? new Date(dateString) : new Date()
      }
    });
    return JSON.stringify({ success: true, message: `Successfully logged ₹${amount} expense to ${vendor} under ${category}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to log expense." }); }
}

async function getExpensesSummary(workspaceId: string) {
  try {
    const expenses = await prisma.expense.groupBy({
      by: ['category'],
      where: { workspaceId },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } }
    });
    const total = decimalToNumber(expenses.reduce((sum, item) => sum.plus(toDecimal(item._sum.amount)), toDecimal(0)));
    return JSON.stringify({
      totalExpenses: `₹${total}`,
      breakdownCategory: expenses.map(e => ({ category: e.category, amount: `₹${e._sum.amount}` }))
    });
  } catch (e) { return JSON.stringify({ error: "Failed to summarize expenses." }); }
}

async function getUnreconciledBankLines(workspaceId: string) {
  try {
    const lines = await (prisma as any).bankTransaction.findMany({
      where: { workspaceId, isReconciled: false, amount: { gt: 0 } },
      orderBy: { date: 'desc' },
      take: 5
    });
    if (lines.length === 0) return JSON.stringify({ message: "No unreconciled deposits found in bank feed. All good!" });
    return JSON.stringify(lines);
  } catch (e) { return JSON.stringify({ error: "Failed to fetch bank feed." }); }
}

async function autoReconcile(transactionId: string, invoiceNumber: string, workspaceId: string) {
  try {
    const invoice = await prisma.invoice.findFirst({ where: { invoiceNumber, workspaceId } });
    if (!invoice) return JSON.stringify({ error: `Could not find invoice ${invoiceNumber}.` });
    
    const transaction = await prisma.bankTransaction.findFirst({ where: { id: transactionId, workspaceId, isReconciled: false } });
    if (!transaction) return JSON.stringify({ error: `Could not find unreconciled transaction ${transactionId}.` });

    const bankAmount = new Prisma.Decimal(Number(transaction.amount)).abs().toDecimalPlaces(2);
    const existingReceived = new Prisma.Decimal(invoice.amountReceived ?? 0);
    const newCumulative = existingReceived.plus(bankAmount).toDecimalPlaces(2);
    const billedAmount = new Prisma.Decimal(invoice.grandTotal ?? invoice.totalAmount ?? 0);
    const ONE_PAISA = new Prisma.Decimal("0.005");
    const newStatus = newCumulative.gte(billedAmount.minus(ONE_PAISA)) ? "PAID" : "PARTIALLY_PAID";

    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { isReconciled: true, matchedInvoiceId: invoice.id, reconciliationConfidence: 100 },
    });
    
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: newStatus,
        amountReceived: newCumulative.toNumber(),
        dateReceived: transaction.date,
      },
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'payment', error: String(error) });
    }
    
    return JSON.stringify({ success: true, message: `Invoice ${invoiceNumber} updated from bank deposit (status ${newStatus}).` });

  } catch (e) { return JSON.stringify({ error: "Reconciliation failed due to DB error." }); }
}

// +++ NEW PROPOSALS & QUOTES TOOLS +++
async function updateProposalStatus(proposalNo: string, status: string, workspaceId: string) {
  try {
    const proposal = await prisma.proposal.findFirst({ where: { proposalNo, workspaceId } });
    if (!proposal) return JSON.stringify({ error: `Could not find a proposal matching ${proposalNo}.` });

    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: status.toUpperCase() }
    });
    return JSON.stringify({ success: true, message: `Updated proposal ${proposalNo} status to ${status.toUpperCase()}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to update proposal status." }); }
}

async function convertProposalToInvoice(proposalNo: string, workspaceId: string) {
  try {
    const proposal = await prisma.proposal.findFirst({ 
      where: { proposalNo, workspaceId },
      include: { client: true }
    });
    
    if (!proposal) return JSON.stringify({ error: `Could not find proposal ${proposalNo}.` });
    if (proposal.status === "INVOICED") return JSON.stringify({ message: "This proposal was already converted to an invoice." });

    // Mark as accepted/invoiced
    await prisma.proposal.update({
      where: { id: proposal.id },
      data: { status: "INVOICED", acceptedAt: new Date() }
    });

    // Bug 5 fix: sort by createdAt (not invoiceNumber string) to get true last invoice
    const latestInvoice = await prisma.invoice.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });
    
    let nextInvNum = "INV-001";
    if (latestInvoice && latestInvoice.invoiceNumber.startsWith("INV-")) {
      const numPart = parseInt(latestInvoice.invoiceNumber.split("-")[1], 10);
      if (!isNaN(numPart)) {
        nextInvNum = `INV-${(numPart + 1).toString().padStart(3, "0")}`;
      } else {
        nextInvNum = `INV-${Date.now().toString().slice(-4)}`;
      }
    }

    const monthCap = await assertFreeTierMonthlyInvoiceAllowed(workspaceId, new Date());
    if (monthCap) return JSON.stringify({ error: monthCap.message });

    // Create converted Invoice
    const newInvoice = await prisma.invoice.create({
      data: {
        workspaceId,
        clientId: proposal.client?.id,
        invoiceNumber: nextInvNum,
        financialYear: new Date().getFullYear().toString(),
        invoiceDate: new Date(),
        clientName: proposal.client?.name || "Unknown Client",
        serviceDescription: proposal.title,
        totalAmount: proposal.totalAmount,
        status: "PENDING",
        pdfPath: "" 
      }
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'invoice', action: 'create', error: String(error) });
    }

    return JSON.stringify({ 
      success: true, 
      message: `Proposal ${proposalNo} marked ACCEPTED! Auto-generated new Invoice ${newInvoice.invoiceNumber} for ₹${newInvoice.totalAmount}.` 
    });

  } catch (e) { return JSON.stringify({ error: "Failed to convert proposal to invoice." }); }
}

// +++ NEW SERVICES & RETAINERS TOOLS +++
async function addServiceToCatalog(name: string, defaultPrice: number, description: string | undefined, workspaceId: string) {
  try {
    const service = await prisma.serviceTemplate.create({
      data: { name, defaultPrice, description, workspaceId }
    });
    return JSON.stringify({ success: true, message: `Added '${service.name}' to Service Catalog at ₹${service.defaultPrice}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to add service to catalog." }); }
}

async function createRetainer(clientName: string, serviceName: string, amount: number, frequency: string, startDateStr: string | undefined, workspaceId: string) {
  try {
    const client = await prisma.client.findFirst({ where: { name: { contains: clientName }, workspaceId } });
    if (!client) return JSON.stringify({ error: `Client ${clientName} not found.` });

    const freqCaps = frequency.toUpperCase();
    let nextDate = new Date();
    if (startDateStr) {
      nextDate = new Date(startDateStr);
    } else {
      if (freqCaps === "MONTHLY") nextDate.setMonth(nextDate.getMonth() + 1);
      else if (freqCaps === "QUARTERLY") nextDate.setMonth(nextDate.getMonth() + 3);
      else if (freqCaps === "ANNUALLY") nextDate.setFullYear(nextDate.getFullYear() + 1);
      else nextDate.setMonth(nextDate.getMonth() + 1); // fallback
    }

    const retainer = await prisma.retainer.create({
      data: {
        workspaceId,
        clientId: client.id,
        serviceName,
        amount,
        frequency: freqCaps,
        nextBillingDate: nextDate,
        status: "ACTIVE"
      }
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'retainer', action: 'create', error: String(error) });
    }

    return JSON.stringify({ 
      success: true, 
      message: `Successfully created ${freqCaps} retainer for ${client.name} for '${serviceName}' at ₹${amount}. Next bill triggers on ${nextDate.toISOString().split('T')[0]}.` 
    });
  } catch (e) { return JSON.stringify({ error: "Failed to wire up retainer." }); }
}

async function updateRetainerStatus(serviceName: string, clientName: string, status: string, workspaceId: string) {
  try {
    const client = await prisma.client.findFirst({ where: { name: { contains: clientName }, workspaceId } });
    if (!client) return JSON.stringify({ error: `Client ${clientName} not found.` });

    const retainer = await prisma.retainer.findFirst({ 
      where: { clientId: client.id, serviceName: { contains: serviceName }, workspaceId } 
    });
    if (!retainer) return JSON.stringify({ error: `Retainer for ${serviceName} not found under client ${client.name}.` });

    await prisma.retainer.update({
      where: { id: retainer.id },
      data: { status: status.toUpperCase() }
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'retainer', action: 'update', error: String(error) });
    }

    return JSON.stringify({ success: true, message: `Retainer ${retainer.serviceName} for ${client.name} is now ${status.toUpperCase()}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to update retainer status." }); }
}

async function getActiveRetainers(workspaceId: string) {
  try {
    const retainers = await prisma.retainer.findMany({
      where: { workspaceId, status: "ACTIVE" },
      include: { client: { select: { name: true } } },
      orderBy: { nextBillingDate: 'asc' }
    });
    if (retainers.length === 0) return JSON.stringify({ message: "No active retainers found." });

    return JSON.stringify(retainers.map(r => ({
      client: r.client.name,
      service: r.serviceName,
      amount: `₹${r.amount}`,
      frequency: r.frequency,
      nextBilling: r.nextBillingDate.toISOString().split('T')[0]
    })));
  } catch (e) { return JSON.stringify({ error: "Failed to fetch retainers." }); }
}

// +++ NEW TAXES & INVESTMENTS TOOLS +++
async function logInvestment(assetName: string, amount: number, category: string, dateString: string | undefined, workspaceId: string) {
  try {
    const investment = await prisma.investment.create({
      data: {
        workspaceId,
        assetName,
        amount,
        category: category.toUpperCase(),
        date: dateString ? new Date(dateString) : new Date()
      }
    });
    return JSON.stringify({ success: true, message: `Successfully logged ₹${amount} for ${assetName} under section ${category.toUpperCase()}.` });
  } catch (e) { return JSON.stringify({ error: "Failed to log investment." }); }
}

async function getInvestmentsList(workspaceId: string) {
  try {
    const investments = await prisma.investment.findMany({
      where: { workspaceId },
      orderBy: { date: 'desc' }
    });
    if (investments.length === 0) return JSON.stringify({ message: "No tax-saving investments logged yet." });
    
    return JSON.stringify(investments.map(i => ({
      asset: i.assetName,
      section: i.category,
      amount: `₹${i.amount}`,
      date: i.date.toISOString().split('T')[0]
    })));
  } catch (e) { return JSON.stringify({ error: "Failed to fetch investments list." }); }
}

async function calculateEstimatedTax(workspaceId: string) {
  try {
    const revenueAgg = await prisma.invoice.aggregate({ where: { workspaceId }, _sum: { totalAmount: true } });
    const expenseAgg = await prisma.expense.aggregate({ where: { workspaceId }, _sum: { amount: true } });
    
    const investments = await prisma.investment.findMany({ where: { workspaceId } });
    const sec80C = Math.min(150000, decimalToNumber(investments.filter(i => i.category.includes('80C')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0))));
    const sec80D = Math.min(25000, decimalToNumber(investments.filter(i => i.category.includes('80D')).reduce((sum, i) => sum.plus(toDecimal(i.amount)), toDecimal(0))));
    
    const grossIncome = decimalToNumber(revenueAgg._sum.totalAmount);
    const grossExpenses = decimalToNumber(expenseAgg._sum.amount);
    const netProfit = grossIncome - grossExpenses;
    
    const totalDeductions = sec80C + sec80D;
    const taxableIncome = Math.max(0, netProfit - totalDeductions);
    const estimatedTax = taxableIncome * 0.30; 

    return JSON.stringify({
      grossIncome: `₹${grossIncome}`,
      grossExpenses: `₹${grossExpenses}`,
      netProfit: `₹${netProfit}`,
      eligibleDeductions: `₹${totalDeductions} (Capped 80C: ₹${sec80C}, Capped 80D: ₹${sec80D})`,
      estimatedTaxableIncome: `₹${taxableIncome}`,
      estimatedTaxLiability30Percent: `₹${estimatedTax}` 
    });
  } catch (e) { return JSON.stringify({ error: "Failed to calculate tax estimation." }); }
}


// +++ NEW INVENTORY TOOLS +++
async function predictStockouts(workspaceId: string) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const products = await prisma.product.findMany({
      where: { workspaceId },
      include: {
        movements: {
          where: {
            type: "OUT",
            createdAt: { gte: thirtyDaysAgo }
          }
        }
      }
    });

    const forecasts = [];
    for (const p of products) {
      if (p.currentStock <= 0) continue;
      
      let outQuantity = 0;
      for (const m of p.movements) {
        outQuantity += Math.abs(m.quantity);
      }
      
      if (outQuantity === 0) continue;
      
      const velocityPerDay = outQuantity / 30;
      const daysUntilOut = Math.floor(p.currentStock / velocityPerDay);
      
      if (daysUntilOut <= 15) {
        forecasts.push({
          sku: p.sku,
          name: p.name,
          currentStock: p.currentStock,
          daysUntilStockout: daysUntilOut,
          velocityPerDay: velocityPerDay.toFixed(2)
        });
      }
    }
    
    if (forecasts.length === 0) return JSON.stringify({ message: "Inventory is healthy. No immediate stockouts predicted based on the last 30 days velocity." });

    return JSON.stringify({
      message: "Here are the items predicted to run out of stock soon based on the last 30 days velocity:",
      forecasts: forecasts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
    });

  } catch (e) {
    return JSON.stringify({ error: "Failed to calculate inventory forecasts." });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const actorRole = String((session as any).businessRole || (session as any).user?.role || '').toUpperCase();

    const parsedBody = chatRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          code: 'CHAT_REQUEST_INVALID',
          error: 'Chat payload is invalid. Please retry with a shorter message.',
          details: parsedBody.error.flatten(),
        },
        { status: 400 },
      );
    }
    const { message, history, context } = parsedBody.data;
    const safeHistory = history.slice(-10);

    const profile = await prisma.businessProfile.findUnique({ 
      where: { workspaceId: workspaceId },
      select: { groqApiKey: true, companyName: true } 
    });
    
    const userApiKeyEncrypted = profile?.groqApiKey;
    let userApiKey = "";

    if (userApiKeyEncrypted) {
      try {
        userApiKey = decrypt(userApiKeyEncrypted);
      } catch (e) {
        console.error("Failed to decrypt Groq API key:", e);
        // Fallback for legacy plain-text keys if decryption fails
        userApiKey = userApiKeyEncrypted;
      }
    }

    // Development fallback: allow a server-provided key to make demos usable without storing a key in DB.
    // This is ONLY used when the workspace key is missing/placeholder/invalid format.
    const envGroqKey = process.env.GROQ_API_KEY?.trim() || "";
    const shouldUseEnvFallback =
      process.env.NODE_ENV === "development" &&
      isProbablyGroqKey(envGroqKey) &&
      !isProbablyGroqKey(userApiKey);

    if (!isProbablyGroqKey(userApiKey) && !shouldUseEnvFallback) {
      return NextResponse.json(
        {
          code: "GROQ_API_KEY_MISSING",
          error:
            "AI Assistant requires a Groq API key. Add it in **Settings → AI Assistant** (`/settings`).",
        },
        { status: 400 },
      );
    }

    const revenueAggregation = await prisma.invoice.aggregate({
      _sum: { totalAmount: true },
      where: { workspaceId: workspaceId }
    });
    const totalRevenue = revenueAggregation._sum.totalAmount || 0;

    // +++ ENHANCEMENT 3: MEANINGFUL & POWERFUL AI PROMPT +++
    const reportingEnabled = await isModuleEnabled(workspaceId, 'REPORTING_CENTER');

    const systemPrompt = `You are the Elite CFO & Executive AI Assistant for ${profile?.companyName || "this business"}. 
    Current Workspace ID: ${workspaceId}.
    Current FY Revenue: ₹${totalRevenue.toLocaleString('en-IN')}.
    Current UI Context: The user is currently viewing the page "${context.currentRoute || 'Unknown'}" (Selected Item: "${context.selectedItemName || 'None'}"). Use this context if they ask to act on 'this' or 'here'.
    
    YOUR RULES & CAPABILITIES:
    1. FINANCIAL MASTERY: You analyze invoices, clients, and taxes. Provide sharp, concise, and professional financial insights. Always format currency in INR (₹).
    2. CONTEXT-AWARE NAVIGATION ('ui_navigate'): You don't just tell users where to go; you take them there. If a user says "Draft an invoice for Acme Corp for ₹50,000", call 'ui_navigate' to path '/income' AND pass a JSON payload { "client": "Acme Corp", "amount": 50000 } so the UI opens the New Invoice modal and auto-fills the form for them.
    3. PROACTIVE ASSISTANCE ('create_task'): You are not read-only. If a user mentions needing to follow up, verify a payment, or do something later, use 'create_task' to add it to their system. Anticipate their needs!
    4. UI THEME CONTROL ('set_ui_theme'): You can switch the user's UI theme instantly without navigation. Use it when the user asks for dark mode, light mode, or system theme.
    5. TONE: Confident, incredibly helpful, and brief. Never use generic AI filler phrases like "I am an AI...". Get straight to the value.
    6. REPORTING CENTER: If user asks for P&L, aging, register, tax summary, or exports, prefer reporting tools (list_reporting_presets, open_reporting_center) and guide them to /reporting.`;

    const groq = new Groq({
      apiKey: shouldUseEnvFallback ? envGroqKey : userApiKey,
      // Keep chat snappy; the SDK retries some transient errors automatically.
      timeout: 12_000,
      maxRetries: 2,
    });
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...safeHistory,
      { role: "user", content: message },
    ];

    const tools = [
      {
        type: "function", function: {
          name: "lookup_invoice_details",
          description: "Fetch details for a specific invoice number.",
          parameters: { type: "object", properties: { invoice_number: { type: "string" } }, required: ["invoice_number"] }
        }
      },
      {
        type: "function", function: {
          name: "get_client_summary",
          description: "Get lifetime revenue and details for a specific client.",
          parameters: { type: "object", properties: { client_name: { type: "string" } }, required: ["client_name"] }
        }
      },
      {
        type: "function", function: {
          name: "get_tax_summary",
          description: "Check how much the user has invested in 80C and 80D tax deductions.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "get_service_catalog",
          description: "Fetches the user's master service catalog.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "get_proposals",
          description: "Fetches the user's recent quotes and proposals.",
          parameters: { 
            type: "object", 
            properties: { status: { type: "string", description: "Optional filter: DRAFT, SENT, ACCEPTED, INVOICED." } } 
          }
        }
      },
      // +++ ENHANCEMENT 2: NEW TOOL DEFINITION +++
      {
        type: "function", function: {
          name: "create_task",
          description: "Create a task, reminder, or to-do item for the user.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "A concise title for the task (e.g., 'Follow up with AWS')." },
              description: { type: "string", description: "Additional context or details." },
              dueDate: { type: "string", description: "Optional ISO date string." }
            },
            required: ["title"]
          }
        }
      },
      // +++ ENHANCEMENT 1: UPGRADED NAVIGATION DEFINITION +++
      {
        type: "function", function: {
          name: "ui_navigate",
          description: "Navigate the user's browser, optionally passing a payload to auto-fill the destination page.",
          parameters: { 
            type: "object", 
            properties: { 
              path: { 
                type: "string", 
                enum: ["/income", "/invoice", "/", "/dashboard", "/clients", "/settings", "/tax", "/services", "/proposals", "/retainers"],
                description: "The URL path. '/income' is Invoices & Earnings (primary, use this to open the New Invoice modal). '/invoice' is a legacy alias that redirects to /income."
              },
              payload: {
                type: "object",
                description: "Optional JSON object containing data to pre-fill forms on the target page (e.g., { clientName: 'Google', amount: 500 }).",
                additionalProperties: true
              }
            }, 
            required: ["path"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "set_ui_theme",
          description: "Switch the ERP UI theme without navigation.",
          parameters: {
            type: "object",
            properties: {
              theme: { type: "string", enum: ["light", "dark", "system"] }
            },
            required: ["theme"]
          }
        }
      },
      // +++ NEW INVOICING TOOLS +++
      {
        type: "function", function: {
          name: "get_overdue_invoices",
          description: "Find all pending invoices where the invoice date is more than 30 days ago (approximation — no due date field exists). Use to identify long-outstanding unpaid invoices.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "mark_invoice_paid",
          description: "Reconcile a specific invoice as fully Paid.",
          parameters: { 
            type: "object", 
            properties: { invoice_number: { type: "string", description: "The exact invoice number (e.g., INV-001)" } }, 
            required: ["invoice_number"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "send_invoice_reminder",
          description: "Trigger an email reminder for an overdue invoice to a client.",
          parameters: { 
            type: "object", 
            properties: { invoice_number: { type: "string" } }, 
            required: ["invoice_number"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "draft_invoice",
          description: "Pre-fill an invoice form based on user instructions and instantly navigate them to the invoice generator.",
          parameters: { 
            type: "object", 
            properties: { 
              client_name: { type: "string", description: "Client to bill" },
              amount: { type: "number", description: "Total numeric amount" },
              description: { type: "string", description: "Services rendered" }
            }, 
            required: ["client_name", "amount"] 
          }
        }
      },
      // +++ NEW CRM TOOLS +++
      {
        type: "function", function: {
          name: "create_client",
          description: "Create a new client in the database. Use this when the user asks to add or onboard a new client.",
          parameters: { 
            type: "object", 
            properties: { 
              name: { type: "string" },
              email: { type: "string" },
              taxId: { type: "string" },
              address: { type: "string" },
              country: { type: "string" }
            }, 
            required: ["name"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "update_client_status",
          description: "Change the status of a CRM client. Status options: ACTIVE, INACTIVE, VIP.",
          parameters: { 
            type: "object", 
            properties: { client_name: { type: "string" }, status: { type: "string", enum: ["ACTIVE", "INACTIVE", "VIP"] } }, 
            required: ["client_name", "status"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "search_clients",
          description: "Perform a fuzzy search to find a client's basic details.",
          parameters: { 
            type: "object", 
            properties: { query: { type: "string" } }, 
            required: ["query"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "get_client_ledger",
          description: "Pull a deep financial report for a specific client, including their invoices, proposals, and retainers.",
          parameters: { 
            type: "object", 
            properties: { client_name: { type: "string" } }, 
            required: ["client_name"] 
          }
        }
      },
      // +++ NEW EXPENSES TOOLS +++
      {
        type: "function", function: {
          name: "log_expense",
          description: "Record a new expense. Use this to automatically categorize and save an expense based on user details.",
          parameters: { 
            type: "object", 
            properties: { 
              vendor: { type: "string" },
              amount: { type: "number" },
              category: { type: "string", description: "Infer standard accounting category e.g., 'Software', 'Meals', 'Travel'" },
              description: { type: "string" },
              dateString: { type: "string", description: "Optional ISO date" }
            }, 
            required: ["vendor", "amount", "category"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "get_expenses_summary",
          description: "Fetch a breakdown of all expenses categorized for the current workspace.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "get_unreconciled_transactions",
          description: "Fetch bank lines (deposits) that haven't been matched to an invoice yet.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "auto_reconcile",
          description: "Matches a bank transaction ID to a specific Invoice number to mark it as completely Paid.",
          parameters: { 
            type: "object", 
            properties: { transactionId: { type: "string" }, invoiceNumber: { type: "string" } }, 
            required: ["transactionId", "invoiceNumber"] 
          }
        }
      },
      // +++ NEW PROPOSALS TOOLS +++
      {
        type: "function", function: {
          name: "draft_proposal",
          description: "Generates a UI payload to take the user directly to the new Proposal form with pre-filled AI details.",
          parameters: { 
            type: "object", 
            properties: { 
              client_name: { type: "string" },
              title: { type: "string", description: "Concise title for the quote (e.g. Website Redesign)" },
              total_amount: { type: "number" }
            }, 
            required: ["client_name", "title", "total_amount"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "update_proposal_status",
          description: "Change the status of a specific Proposal (e.g., DRAFT, SENT, VIEWED, DECLINED).",
          parameters: { 
            type: "object", 
            properties: { proposal_no: { type: "string" }, status: { type: "string", enum: ["DRAFT", "SENT", "VIEWED", "DECLINED"] } }, 
            required: ["proposal_no", "status"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "convert_to_invoice",
          description: "When a client ACCEPTS a proposal, use this to instantly mark it as INVOICED and automatically generate an Invoice.",
          parameters: { 
            type: "object", 
            properties: { proposal_no: { type: "string", description: "Exact quote ID string like EST-2024-001" } }, 
            required: ["proposal_no"] 
          }
        }
      },
      // +++ NEW SERVICES & RETAINERS TOOLS +++
      {
        type: "function", function: {
          name: "add_service_to_catalog",
          description: "Add a new standardized service offering to the global catalog.",
          parameters: { 
            type: "object", 
            properties: { 
              name: { type: "string" },
              default_price: { type: "number" },
              description: { type: "string" }
            }, 
            required: ["name", "default_price"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "create_retainer",
          description: "Set up a recurring automated subscription/retainer for a client.",
          parameters: { 
            type: "object", 
            properties: { 
              client_name: { type: "string" },
              service_name: { type: "string" },
              amount: { type: "number" },
              frequency: { type: "string", enum: ["MONTHLY", "QUARTERLY", "ANNUALLY"] },
              start_date: { type: "string", description: "Optional ISO start date. If omitted, uses 1 cycle from today." }
            }, 
            required: ["client_name", "service_name", "amount", "frequency"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "update_retainer_status",
          description: "Update the lifecycle state of a specific client's recurring retainer.",
          parameters: { 
            type: "object", 
            properties: { 
              service_name: { type: "string" },
              client_name: { type: "string" },
              status: { type: "string", enum: ["ACTIVE", "PAUSED", "CANCELLED"] }
            }, 
            required: ["service_name", "client_name", "status"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "get_active_retainers",
          description: "Fetch a list of all currently active recurring retainers across the entire workspace.",
          parameters: { type: "object", properties: {} }
        }
      },
      // +++ NEW TAXES TOOLS +++
      {
        type: "function", function: {
          name: "log_investment",
          description: "Record a new tax-saving investment globally. E.g. LIC, ELSS, Health Insurance.",
          parameters: { 
            type: "object", 
            properties: { 
              asset_name: { type: "string" },
              amount: { type: "number" },
              category: { type: "string", description: "Tax section e.g. '80C' or '80D'" },
              date_string: { type: "string", description: "Optional ISO date" }
            }, 
            required: ["asset_name", "amount", "category"] 
          }
        }
      },
      {
        type: "function", function: {
          name: "get_investments_list",
          description: "Fetch a historical log of all individual tax-saving investments made so far.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "calculate_estimated_tax",
          description: "Runs a massive automated P&L script across Revenues, Expenses, and capped Deductions to calculate a 30% tax liability estimate.",
          parameters: { type: "object", properties: {} }
        }
      },
      // +++ NEW INVENTORY TOOLS +++
      {
        type: "function", function: {
          name: "predict_stockouts",
          description: "Calculates the recent 30-day sales velocity across all inventory products and predicts which products will run out of stock in the next 15 days.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "list_reporting_presets",
          description: "List available Reporting Center presets for non-technical users.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function", function: {
          name: "open_reporting_center",
          description: "Open Reporting Center with a selected preset and optional filters.",
          parameters: {
            type: "object",
            properties: {
              presetId: { type: "string" },
              filters: { type: "object", additionalProperties: true }
            },
            required: ["presetId"]
          }
        }
      }
    ];

    const initialResponse = await groq.chat.completions.create(
      {
        messages,
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        tools: tools as any,
        tool_choice: "auto",
      },
      { timeout: 12_000, maxRetries: 2 },
    );

    const responseMessage = initialResponse.choices[0]?.message;
    let actionPayload: ToolAction | null = null;

    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push(responseMessage);

      const toolPromises = responseMessage.tool_calls.map(async (toolCall: any) => {
        let args: any = {};
        let dbResult = "";
        let action = null;

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          // If the AI hallucinates bad JSON, catch it and return an error gracefully
          // so the AI can correct itself on the next turn.
          return {
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify({ error: "Invalid JSON arguments. Please call the tool again with valid JSON." }),
            action: null
          };
        }

        // Refactored tool handlers for better scalability
        const toolHandlers: Record<string, Function> = {
          lookup_invoice_details: (a: any, wid: string) => lookupInvoiceDetails(a.invoice_number, wid),
          get_client_summary: (a: any, wid: string) => getClientSummary(a.client_name, wid),
          get_tax_summary: (_a: any, wid: string) => getTaxSummary(wid),
          get_service_catalog: (_a: any, wid: string) => getServiceCatalog(wid),
          get_proposals: (a: any, wid: string) => getProposals(wid, a.status),
          create_task: (a: any, wid: string) => createTask(a.title, a.description, a.dueDate, wid),
          get_overdue_invoices: (_a: any, wid: string) => getOverdueInvoices(wid),
          mark_invoice_paid: (a: any, wid: string) => markInvoicePaid(a.invoice_number, wid),
          send_invoice_reminder: (a: any, wid: string) => sendInvoiceReminder(a.invoice_number, wid),
          create_client: (a: any, wid: string) => createClient(a.name, a.email, a.taxId, a.address, a.country, wid),
          update_client_status: (a: any, wid: string) => updateClientStatus(a.client_name, a.status, wid),
          search_clients: (a: any, wid: string) => searchClients(a.query, wid),
          get_client_ledger: (a: any, wid: string) => getClientLedger(a.client_name, wid),
          log_expense: (a: any, wid: string) => logExpense(a.vendor, a.amount, a.category, a.description, a.dateString, wid),
          get_expenses_summary: (_a: any, wid: string) => getExpensesSummary(wid),
          get_unreconciled_transactions: (_a: any, wid: string) => getUnreconciledBankLines(wid),
          auto_reconcile: (a: any, wid: string) => autoReconcile(a.transactionId, a.invoiceNumber, wid),
          update_proposal_status: (a: any, wid: string) => updateProposalStatus(a.proposal_no, a.status, wid),
          convert_to_invoice: (a: any, wid: string) => convertProposalToInvoice(a.proposal_no, wid),
          add_service_to_catalog: (a: any, wid: string) => addServiceToCatalog(a.name, a.default_price, a.description, wid),
          create_retainer: (a: any, wid: string) => createRetainer(a.client_name, a.service_name, a.amount, a.frequency, a.start_date, wid),
          update_retainer_status: (a: any, wid: string) => updateRetainerStatus(a.service_name, a.client_name, a.status, wid),
          get_active_retainers: (_a: any, wid: string) => getActiveRetainers(wid),
          log_investment: (a: any, wid: string) => logInvestment(a.asset_name, a.amount, a.category, a.date_string, wid),
          get_investments_list: (_a: any, wid: string) => getInvestmentsList(wid),
          calculate_estimated_tax: (_a: any, wid: string) => calculateEstimatedTax(wid),
          predict_stockouts: (_a: any, wid: string) => predictStockouts(wid),
          list_reporting_presets: async () => JSON.stringify({ presets: REPORT_PRESETS.map((p) => ({ id: p.id, title: p.title, description: p.description })) })
        };

        if (!canExecuteToolForRole(toolCall.function.name, actorRole)) {
          dbResult = JSON.stringify({
            error: `Tool ${toolCall.function.name} requires elevated permissions for your workspace role.`,
          });
        } else if (toolHandlers[toolCall.function.name]) {
          dbResult = await toolHandlers[toolCall.function.name](args, workspaceId);
        } else if (toolCall.function.name === "draft_proposal") {
          // Bug 6 fix: /proposals/new does not exist — the proposals page is a single-page
          // component with internal state (view: 'list' | 'builder'). Route to /proposals.
          action = { type: 'NAVIGATE', path: '/proposals', payload: { clientName: args.client_name, title: args.title, totalAmount: args.total_amount } };
          dbResult = JSON.stringify({ status: `Success. Redirecting user to proposal form.` });
        } else if (toolCall.function.name === "draft_invoice") {
          action = { type: 'NAVIGATE', path: '/invoice', payload: { client: args.client_name, amount: args.amount, description: args.description } };
          dbResult = JSON.stringify({ status: `Success. Pushed actionPayload to UI to load invoice form for ${args.client_name}.` });
        } else if (toolCall.function.name === "open_reporting_center") {
          if (!canUseReportingTools(actorRole, reportingEnabled)) {
            dbResult = JSON.stringify({ error: 'Reporting Center is disabled or not allowed for your role.' });
          } else {
            action = { type: 'NAVIGATE', path: `/reporting/${args.presetId}`, payload: args.filters || null };
            dbResult = JSON.stringify({ status: `Success. Opened Reporting Center preset ${args.presetId}.` });
          }
        } else if (toolCall.function.name === "ui_navigate") {
          action = { type: 'NAVIGATE', path: args.path, payload: args.payload || null };
          dbResult = JSON.stringify({ status: `Success. Redirected user to ${args.path} and injected payload data.` });
        } else if (toolCall.function.name === "set_ui_theme") {
          action = { type: 'SET_THEME', theme: args.theme };
          dbResult = JSON.stringify({ status: `Success. Updated theme to ${args.theme}.` });
        } else {
          dbResult = JSON.stringify({ error: `Tool ${toolCall.function.name} is not recognized or not implemented.` });
        }

        return {
          role: "tool", 
          tool_call_id: toolCall.id, 
          name: toolCall.function.name, 
          content: dbResult,
          action
        };
      });

      const toolResults = await Promise.all(toolPromises);

      for (const result of toolResults) {
        if (result.action && !actionPayload) actionPayload = result.action as ToolAction;
        messages.push({ role: result.role, tool_call_id: result.tool_call_id, name: result.name, content: result.content });
      }

      const finalResponse = await groq.chat.completions.create(
        {
          messages,
          model: "llama-3.1-8b-instant",
          temperature: 0.5,
        },
        { timeout: 12_000, maxRetries: 2 },
      );

      return NextResponse.json({ 
        reply: finalResponse.choices[0]?.message?.content,
        action: actionPayload 
      });
    }

    return NextResponse.json({ reply: responseMessage?.content || "I couldn't process that.", action: null });

  } catch (error: any) {
    console.error("Chat Error Server Log:", error); 
    const mapped = groqErrorToHttp(error);
    return NextResponse.json({ code: mapped.code, error: mapped.message }, { status: mapped.status });
  }
}
