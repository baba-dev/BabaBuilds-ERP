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

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export type Product = {
  id: string; sku: string; name: string; description: string | null; category: string | null; unit: string;
  baselinePrice: number | string; costPrice: number | string; hsnCode: string | null; gstRate: number | null;
  currentStock: number; safetyStock: number; status: StockStatus; barcode: string | null; imageUrl: string | null; location: string | null;
  showInShop: boolean; reorderQuantity: number | null; leadTimeDays: number | null; archivedAt: string | null;
};

export type ProductList = { items: Product[]; nextCursor: string | null; categories: string[] };

export type ProductDetail = Product & {
  movements: Movement[];
  onOrder: { poId: string; poNumber: string; expectedDate: string | null; outstanding: number }[];
  stats: { sold30: number; sold90: number; dailyDemand: number; daysOfCover: number | null; marginPct: number | null; stockValue: number; lastSold: string | null };
};
export type VendorHit = { id: string; name: string; gstin: string | null; stateCode: string | null; paymentTermsDays: number | null };

export type Movement = {
  id: string; type: "IN" | "OUT" | "ADJ"; quantity: number; reason: string | null; createdAt: string; balanceAfter: number | null; unitCost: number | string | null;
  product?: { name: string; sku: string; unit: string };
};

export type Insights = {
  summary: { units: number; stockValue: number; retailValue: number; potentialMargin: number; marginPct: number; lowStock: number; outOfStock: number; negativeStock: number; products?: number };
  reorder: { productId: string; name: string; sku: string; unit: string; currentStock: number; onOrder: number; dailyDemand: number; daysOfCover: number | null; suggestedQty: number; estimatedCost: number; urgency: "NOW" | "SOON"; reason: "OUT_OF_STOCK" | "BELOW_SAFETY" | "LOW_COVER"; preferredVendorId: string | null }[];
  dead: { items: { productId: string; name: string; sku: string; units: number; tiedUp: number; lastSold: string | null }[]; tiedUp: number; days: number };
};

export type PoItem = { id: string; productId: string; quantity: number; receivedQuantity: number; unitPrice: number | string; product: { id: string; name: string; sku: string; unit: string } };
export type PurchaseOrder = {
  id: string; poNumber: string; supplier: string; status: "DRAFT" | "SENT" | "PARTIAL" | "DELIVERED" | "CANCELLED";
  totalAmount: number | string; expectedDate: string | null; createdAt: string; notes: string | null; supplierGstin: string | null; paymentTermsDays: number | null; items: PoItem[];
};
