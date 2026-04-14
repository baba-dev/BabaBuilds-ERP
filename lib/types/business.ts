export type InvoiceStatusDto = "PENDING" | "PAID" | "PARTIALLY_PAID" | "Paid" | "Partially Paid";

export type InvoiceDto = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  updatedAt?: string | Date;
  clientName: string;
  status: InvoiceStatusDto;
  totalAmount: number;
  amountReceived: number | null;
  dateReceived: string | Date | null;
  pdfPath?: string;
};

export type ExpenseDto = {
  id: string;
  date: string | Date;
  category: string;
  vendor: string;
  amount: number;
  description: string | null;
  receiptUrl: string | null;
};

export type ClientDto = {
  id: string;
  name: string;
  address: string;
  country: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  isExport: boolean;
  logoUrl: string | null;
  updatedAt?: string | Date;
};

export type ApiKpis = {
  totalRevenue: number;
  outstanding: number;
  presumptiveIncome: number;
};

export type ApiMeta = {
  currentPage: number;
  totalPages: number;
  totalRecords?: number;
  kpis?: ApiKpis;
};

export type ApiEnvelope<TData, TMeta = ApiMeta> = {
  data: TData;
  meta: TMeta;
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
};

const asString = (value: unknown) => (typeof value === "string" ? value : null);

const asFiniteNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

export type ExpenseUpdatePayload = {
  date: string;
  category: string;
  vendor: string;
  amount: number;
  description?: string;
};

export const parseExpenseUpdatePayload = (payload: unknown): ExpenseUpdatePayload | null => {
  const record = asRecord(payload);
  if (!record) return null;

  const date = asString(record.date);
  const category = asString(record.category);
  const vendor = asString(record.vendor);
  const amount = asFiniteNumber(record.amount);
  const descriptionRaw = record.description;

  if (!date || !category || !vendor || amount === null) return null;

  if (descriptionRaw != null && typeof descriptionRaw !== "string") return null;

  return {
    date,
    category,
    vendor,
    amount,
    description: descriptionRaw ?? undefined,
  };
};

export type InvoicePaymentPayload = {
  amountReceived: number;
  dateReceived: string;
};

export const parseInvoicePaymentPayload = (payload: unknown): InvoicePaymentPayload | null => {
  const record = asRecord(payload);
  if (!record) return null;

  const dateReceived = asString(record.dateReceived);
  const amountReceived = asFiniteNumber(record.amountReceived);

  if (!dateReceived || amountReceived === null) return null;

  return { amountReceived, dateReceived };
};
export type BusinessProfileDto = {
  companyName: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFromEmail: string | null;
};

export type MailAttachment = {
  filename: string;
  path: string;
  contentType?: string;
};

export type MailOptions = {
  route?: "user" | "system";
  profile?: BusinessProfileDto | null;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
};
