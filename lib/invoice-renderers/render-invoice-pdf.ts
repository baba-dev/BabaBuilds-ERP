import { PDFDocument, StandardFonts } from "pdf-lib";

import { createPaginator } from "@/lib/invoice-templates/shared/paginator";
import type { PdfFonts } from "@/lib/invoice-templates/types";
import { embedUnicodeFonts } from "@/lib/invoice-templates/shared/fonts";
import { getInvoiceTemplate } from "@/lib/invoice-templates/registry";
import "@/lib/invoice-templates";
import type { InvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";

const embedFonts = async (pdfDoc: PDFDocument): Promise<PdfFonts> => {
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  return { regular, bold, oblique };
};

export const renderInvoicePdf = async (vm: InvoiceViewModel): Promise<Uint8Array> => {
  const template = getInvoiceTemplate(vm.template.resolvedTemplateId);
  const pdfDoc = await PDFDocument.create();
  const fonts = template.meta.fonts === "unicode" ? await embedUnicodeFonts(pdfDoc) : await embedFonts(pdfDoc);
  const paginator = createPaginator(pdfDoc, { paperSize: template.meta.paperSize });
  await template.draw({ pdfDoc, fonts, vm, paginator });
  paginator.finalize();
  return pdfDoc.save();
};

