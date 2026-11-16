export class ApiError extends Error {
  code: string;
  constructor(message: string, code = "ERROR") { super(message); this.code = code; }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((body && typeof body.error === "string" && body.error) || `Request failed (${res.status})`, body?.code);
  return body as T;
}

export type ShopStatus = "PENDING" | "PAID" | "SHIPPED" | "FULFILLED" | "FAILED" | "REFUND_DUE" | "REFUNDED";
export const STATUSES: ShopStatus[] = ["PENDING", "PAID", "SHIPPED", "FULFILLED", "FAILED", "REFUND_DUE", "REFUNDED"];

export type OrderItem = { id?: string; productName: string; sku?: string; quantity: number; unitPrice: number | string; lineTotal?: number | string; lineTax?: number | string; taxRate?: number };
export type Order = {
  id: string; buyerName: string; buyerEmail: string; buyerPhone: string | null; buyerNote: string | null; shippingAddress: string | null; buyerGstin: string | null;
  subtotal: number | string; taxTotal: number | string; amount: number | string; currency: string; gateway: string | null; status: ShopStatus;
  razorpayPaymentId: string | null; stripePaymentIntentId: string | null; courier: string | null; trackingRef: string | null; internalNote: string | null;
  createdAt: string; paidAt: string | null; shippedAt: string | null; fulfilledAt: string | null; refundedAt: string | null;
  items: OrderItem[]; linkedInvoice?: { id: string; invoiceNumber: string; status?: string } | null;
};
export type OrdersResponse = {
  orders: Order[]; nextCursor: string | null;
  overview: { counts: Record<string, number>; total: number; revenue: number; tax: number; needsAction: number };
};

export type ShopSettings = {
  shopEnabled: boolean; shopSlug: string | null; shopTagline: string | null; shopAccentColor: string;
  readiness: { gateway: "RAZORPAY" | "STRIPE" | null; email: boolean; listedProducts: number; gstRegistrationType: string | null };
};

export type CatalogProduct = { id: string; sku: string; name: string; category: string | null; baselinePrice: number | string; gstRate: number | null; currentStock: number; showInShop: boolean; status: string; archivedAt: string | null };

export type SocialPlatform = "website" | "instagram" | "facebook" | "x" | "linkedin" | "youtube" | "whatsapp" | "tiktok" | "pinterest" | "github" | "custom";
export const SOCIAL_PLATFORMS: SocialPlatform[] = ["website", "instagram", "facebook", "x", "linkedin", "youtube", "whatsapp", "tiktok", "pinterest", "github", "custom"];
export type ContentDraft = { announcement: string; aboutMd: string; footerNote: string; social: { platform: SocialPlatform; url: string; label: string }[]; faq: { q: string; a: string }[]; showAiAssist: boolean };
export const EMPTY_CONTENT: ContentDraft = { announcement: "", aboutMd: "", footerNote: "", social: [], faq: [], showAiAssist: true };

/** Turns whatever the API returns into a safe form draft. */
export function toContentDraft(raw: unknown): ContentDraft {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    announcement: str(c.announcement), aboutMd: str(c.aboutMd), footerNote: str(c.footerNote),
    social: list(c.social).map((s) => ({ platform: SOCIAL_PLATFORMS.includes(s?.platform as SocialPlatform) ? (s.platform as SocialPlatform) : "custom", url: str(s?.url), label: str(s?.label) })),
    faq: list(c.faq).map((f) => ({ q: str(f?.q), a: str(f?.a) })),
    showAiAssist: c.showAiAssist !== false,
  };
}
