import type { InvoiceTemplate, InvoiceTemplateMeta, PaperSize } from "@/lib/invoice-templates/types";

const templates = new Map<string, InvoiceTemplate>();

export const registerInvoiceTemplate = (template: InvoiceTemplate) => {
  templates.set(template.meta.id, template);
};

export const getInvoiceTemplate = (id: string): InvoiceTemplate => {
  return templates.get(id) || templates.get("DESIGN_1") || Array.from(templates.values())[0];
};

export const listInvoiceTemplates = (opts?: { paperSize?: PaperSize }): InvoiceTemplateMeta[] => {
  const all = Array.from(templates.values()).map((template) => template.meta);
  if (!opts?.paperSize) return all;
  return all.filter((meta) => meta.paperSize === opts.paperSize);
};

export const resolveInvoiceTemplateId = ({
  requestedTemplateId,
  profileTheme,
  fallbackId = "DESIGN_1",
}: {
  requestedTemplateId?: string | null;
  profileTheme?: string | null;
  fallbackId?: string;
}): string => {
  const candidateIds = [requestedTemplateId, profileTheme, fallbackId].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  for (const id of candidateIds) {
    if (templates.has(id)) return id;
  }

  if (templates.has(fallbackId)) return fallbackId;
  return Array.from(templates.keys())[0] || "DESIGN_1";
};
