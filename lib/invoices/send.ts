import "server-only";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { formatCurrency } from "@/lib/currency";
import { buildInvoiceDeliveryEmail } from "@/lib/notifications/transactional-email-templates";
import { getErrorMessage } from "@/lib/error-utils";
import { resolveInvoicePdfStoragePath, getInvoicePublicFallbackPath } from "@/lib/invoice/pdf-storage";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { getClientRecipients } from "@/lib/clients/service";
import type { PaymentFailure } from "@/lib/invoices/payments";

const RESEND_COOLDOWN_MS = 30_000;

/** Emails the invoice PDF to the client. Uses the private PDF store (with the legacy public path as fallback). */
export async function sendInvoiceEmail(input: {
  workspaceId: string;
  userId: string;
  invoiceId: string;
}): Promise<{ ok: true } | PaymentFailure> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, workspaceId: input.workspaceId },
    include: { client: true },
  });
  if (!invoice) return { ok: false, status: 404, code: "INVOICE_NOT_FOUND", message: "Invoice not found." };
  if (invoice.status === "VOID") {
    return { ok: false, status: 409, code: "INVOICE_VOID", message: "A voided invoice cannot be sent." };
  }
  const recipients = invoice.client ? await getClientRecipients(invoice.client.id, input.workspaceId, "invoice") : [];
  if (!invoice.client || recipients.length === 0) {
    return { ok: false, status: 400, code: "NO_CLIENT_EMAIL", message: "This client has no email address on file." };
  }
  if (invoice.sentAt && Date.now() - invoice.sentAt.getTime() < RESEND_COOLDOWN_MS) {
    return { ok: false, status: 409, code: "TOO_SOON", message: "This invoice was just sent. Please wait a few seconds before sending again." };
  }

  const [profile, workspace] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { workspaceId: input.workspaceId } }),
    prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { countryCode: true } }),
  ]);
  if (!profile || !profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
    return { ok: false, status: 400, code: "SMTP_NOT_CONFIGURED", message: "Email (SMTP) is not configured in Business Settings." };
  }

  const privatePath = resolveInvoicePdfStoragePath(invoice);
  const absolutePdfPath = privatePath && fs.existsSync(privatePath) ? privatePath : getInvoicePublicFallbackPath(invoice.pdfPath);
  if (!fs.existsSync(absolutePdfPath)) {
    return { ok: false, status: 404, code: "PDF_NOT_FOUND", message: "The invoice PDF could not be found on the server." };
  }

  const locale = workspace?.countryCode === "IN" ? "en-IN" : "en-US";
  const email = buildInvoiceDeliveryEmail({
    companyName: profile.companyName,
    clientName: invoice.client.name,
    invoiceNumber: invoice.invoiceNumber,
    billingMonth: invoice.billingMonth,
    amountFormatted: formatCurrency(effectiveTotal(invoice).toString(), invoice.currency, locale),
  });

  try {
    await sendEmail({
      route: "user",
      profile,
      to: recipients.join(", "),
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [{ filename: path.basename(absolutePdfPath), path: absolutePdfPath }],
    });
  } catch (error) {
    console.error("[invoice-send] email failed", error);
    return { ok: false, status: 502, code: "SEND_FAILED", message: getErrorMessage(error) || "Failed to send the invoice email." };
  }

  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoice.id }, data: { sentAt: new Date() } }),
    prisma.invoiceEvent.create({
      data: {
        workspaceId: input.workspaceId,
        invoiceId: invoice.id,
        type: "SENT",
        message: `Emailed to ${recipients.join(", ")}`,
        actorUserId: input.userId,
      },
    }),
  ]);
  return { ok: true };
}

