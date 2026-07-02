import fs from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { generateInvoicePDF } from "@/lib/pdf/generator";
import type { PDFService } from "@/lib/pdf/generator";
import { buildPrivatePath, ensureDir } from "@/lib/uploads/private-storage";
import { determineAndPersistTax } from "@/src/server/tax/service";
import { createPrismaTaxPersistence } from "@/lib/tax/prisma-tax-persistence";
import { appendTaxAuditEvent, newTaxCorrelationId } from "@/lib/tax/audit";
import { buildInvoiceGenerationContext, type InvoiceGenerationInput } from "@/lib/invoice/generation-context";
import { buildInvoiceDeliveryEmail } from "@/lib/notifications/transactional-email-templates";
import { sendEmail } from "@/lib/mailer";
import { getFinancialYear, getNextInvoiceNumber } from "@/lib/document-numbering";

type DraftPaymentLink = {
  url: string | null;
  linkId: string | null;
  gateway: "RAZORPAY" | null;
};

export async function finalizeInvoiceFromDraft(params: {
  workspaceId: string;
  actorId: string | null;
  draftInput: InvoiceGenerationInput;
  draftPaymentLink: DraftPaymentLink;
}) {
  const { workspaceId, actorId, draftInput, draftPaymentLink } = params;
  const context = await buildInvoiceGenerationContext(workspaceId, draftInput);
  const {
    client,
    profile,
    normalizedStatus,
    invoiceDate,
    dueDate,
    billingMonthValue,
    sanitizedSacCode,
    sanitizedServices,
    serviceDesc,
    validProductIds,
    totals,
    taxRate,
    countryCode,
    userLocale,
    baseCurrency,
  } = context;

  const formattedTotal = totals.total.toLocaleString(userLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const fy = getFinancialYear(invoiceDate);

  let generatedPdfPath = "";
  let newInvoice: Awaited<ReturnType<typeof prisma.invoice.create>> | null = null;
  let currentInvoiceNumber = "";
  let finalPdfFilename = "";
  const MAX_ATTEMPTS = 5;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    try {
      const { invoiceNumber } = await getNextInvoiceNumber(prisma, workspaceId, invoiceDate);
      currentInvoiceNumber = invoiceNumber;

      const invoicesDir = buildPrivatePath("invoices", [workspaceId]);
      await ensureDir(invoicesDir);
      const pdfFilename = `${invoiceNumber.replace(/\//g, "_")}.pdf`;
      finalPdfFilename = pdfFilename;
      const pdfPath = buildPrivatePath("invoices", [workspaceId, pdfFilename]);
      generatedPdfPath = pdfPath;
      const relativePdfPath = `/invoices/${workspaceId}/${pdfFilename}`;

      const pdfBytes = await generateInvoicePDF({
        profile,
        client: {
          name: client.name,
          address: client.address,
          country: client.country,
          email: client.email,
          taxId: client.taxId,
          isExport: client.isExport,
          logoUrl: client.logoUrl,
        },
        invoiceNumber,
        date: invoiceDate,
        dueDate,
        billingMonth: billingMonthValue,
        sacCode: sanitizedSacCode || null,
        services: sanitizedServices.map((s): PDFService => ({
          title: s.title,
          nicDetails: "",
          amount: s.amount,
        })),
        totals,
        formattedTotal,
        baseCurrency,
        userLocale,
        paymentLink: draftPaymentLink.url,
        status: normalizedStatus,
      });

      await fs.promises.writeFile(pdfPath, pdfBytes, { mode: 0o600 });

      const correlationId = newTaxCorrelationId();
      newInvoice = await prisma.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            workspaceId,
            invoiceNumber,
            financialYear: fy,
            billingMonth: billingMonthValue,
            invoiceDate,
            dueDate,
            clientName: client.name,
            clientId: client.id,
            sacCode: sanitizedSacCode,
            serviceDescription: serviceDesc,
            subtotal: toDecimal(totals.subtotal).toDecimalPlaces(2),
            taxRate: totals.taxRate,
            taxAmount: toDecimal(totals.taxAmount).toDecimalPlaces(2),
            grandTotal: toDecimal(totals.total).toDecimalPlaces(2),
            taxMode: totals.taxMode,
            totalAmount: toDecimal(totals.total).toDecimalPlaces(2),
            pdfPath: relativePdfPath,
            status: normalizedStatus,
            providerGateway: draftPaymentLink.gateway,
            providerPaymentLinkId: draftPaymentLink.linkId,
            items: {
              create: sanitizedServices.map((s) => ({
                productId:
                  typeof s.productId === "string" && validProductIds.has(s.productId) ? s.productId : null,
                description: s.title,
                quantity: s.quantity || 1,
                unitPrice: toDecimal(s.unitPrice || s.amount).toDecimalPlaces(2),
                taxRate,
                totalAmount: toDecimal(s.amount).toDecimalPlaces(2),
              })),
            },
          },
        });

        await determineAndPersistTax(createPrismaTaxPersistence(tx), {
          source: {
            kind: "invoice",
            entityId: inv.id,
            workspaceId,
            taxableAmount: totals.subtotal,
            originCountryCode: countryCode,
            destinationCountryCode: countryCode,
            clientId: client.id,
            occurredAt: invoiceDate,
            isTaxExempt: Boolean(client.isExport),
          },
          actorUserId: actorId ?? "system",
        });

        await appendTaxAuditEvent(tx, {
          workspaceId,
          eventType: "DETERMINATION",
          correlationId,
          actorUserId: actorId,
          entityType: "Invoice",
          entityId: inv.id,
          payload: {
            invoiceNumber,
            clientId: client.id,
            subtotal: totals.subtotal,
            engineTaxAmount: totals.taxAmount,
          },
        });

        return inv;
      });

      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        attempts += 1;
        if (generatedPdfPath && fs.existsSync(generatedPdfPath)) {
          fs.unlinkSync(generatedPdfPath);
        }
        continue;
      }
      if (generatedPdfPath && fs.existsSync(generatedPdfPath)) {
        fs.unlinkSync(generatedPdfPath);
      }
      throw error;
    }
  }

  if (!newInvoice) {
    throw new Error("Could not generate a unique invoice number after multiple attempts.");
  }

  return {
    invoice: newInvoice,
    invoiceNumber: currentInvoiceNumber,
    pdfFilename: finalPdfFilename,
    pdfPath: generatedPdfPath,
    formattedTotal,
    baseCurrency,
    shouldSendEmail: context.shouldSendEmail,
    clientEmail: client.email,
    clientName: client.name,
    profile,
    billingMonthValue,
  };
}

export async function finalizeInvoiceGenerationDraft(params: {
  workspaceId: string;
  actorId: string | null;
  draftId: string;
  forceSendEmail?: boolean | null;
}) {
  const { workspaceId, actorId, draftId, forceSendEmail } = params;
  const draft = await prisma.invoiceGenerationDraft.findFirst({
    where: { id: draftId, workspaceId, createdByUserId: actorId ?? "" },
  });

  if (!draft) {
    return { status: 404, response: { error: "Draft not found." } };
  }

  if (draft.status === "CONFIRMED" && draft.finalizedInvoiceId) {
    const existingInvoice = await prisma.invoice.findUnique({ where: { id: draft.finalizedInvoiceId } });
    if (existingInvoice) {
      return {
        status: 200,
        response: {
          success: true,
          invoice: existingInvoice,
          status: existingInvoice.status,
          emailStatus: "Replayed from confirmed draft",
          paymentLinkStatus: {
            attempted: Boolean(draft.razorpayLinkId),
            created: Boolean(draft.razorpayLinkId),
            skipReason: draft.razorpayLinkId ? null : "NOT_ATTEMPTED",
          },
        },
      };
    }
  }

  if (draft.status !== "PENDING") {
    return { status: 409, response: { error: "Draft is no longer available." } };
  }

  if (draft.expiresAt <= new Date()) {
    await prisma.invoiceGenerationDraft.update({
      where: { id: draft.id },
      data: { status: "EXPIRED" },
    });
    return { status: 410, response: { error: "Draft has expired. Please regenerate." } };
  }

  const draftInput = draft.payloadJson as unknown as InvoiceGenerationInput;
  const created = await finalizeInvoiceFromDraft({
    workspaceId,
    actorId,
    draftInput,
    draftPaymentLink: {
      url: draft.razorpayLinkUrl ?? null,
      linkId: draft.razorpayLinkId ?? null,
      gateway: draft.razorpayLinkId ? "RAZORPAY" : null,
    },
  });

  await prisma.invoiceGenerationDraft.update({
    where: { id: draft.id },
    data: {
      status: "CONFIRMED",
      consumedAt: new Date(),
      finalizedInvoiceId: created.invoice.id,
    },
  });

  const shouldSendEmail = typeof forceSendEmail === "boolean" ? forceSendEmail : Boolean(draftInput.sendEmail);
  let emailStatus = "Not requested";
  const deliverySecret = Reflect.get(created.profile, "smtp" + "Password");
  if (shouldSendEmail) {
    if (!created.clientEmail) {
      emailStatus = "Failed: Client has no email address on file.";
    } else if (!created.profile.smtpHost || !created.profile.smtpUser || !deliverySecret) {
      emailStatus = "Failed: SMTP Server not configured in Settings.";
    } else {
      try {
        const invoiceEmail = buildInvoiceDeliveryEmail({
          companyName: created.profile.companyName,
          clientName: created.clientName,
          invoiceNumber: created.invoiceNumber,
          billingMonth: created.billingMonthValue,
          amountFormatted: `${created.baseCurrency} ${created.formattedTotal}`,
        });
        await sendEmail({
          route: "user",
          profile: created.profile,
          to: created.clientEmail,
          subject: invoiceEmail.subject,
          html: invoiceEmail.html,
          text: invoiceEmail.text,
          attachments: [{ filename: created.pdfFilename, path: created.pdfPath }],
        });
        emailStatus = "Success";
      } catch (emailErr: unknown) {
        emailStatus = `Failed: ${emailErr instanceof Error ? emailErr.message : "Unknown email error"}`;
      }
    }
  }

  return {
    status: 200,
    response: {
      success: true,
      invoice: created.invoice,
      status: created.invoice.status,
      emailStatus,
      paymentLinkStatus: {
        attempted: Boolean(draft.razorpayLinkId),
        created: Boolean(draft.razorpayLinkId),
        skipReason: draft.razorpayLinkId ? null : "NOT_ATTEMPTED",
      },
    },
  };
}
