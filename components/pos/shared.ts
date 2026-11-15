export class ApiError extends Error {
  code: string;
  constructor(message: string, code = "ERROR") { super(message); this.code = code; }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((body && typeof body.error === "string" && body.error) || `Request failed (${res.status})`, body?.code);
  return body as T;
}

export type CatalogItem = {
  id: string; type: "SERVICE" | "PRODUCT"; name: string; price: number; description?: string | null; taxRate: number;
  sku?: string; barcode?: string | null; category?: string | null; unit?: string; stock?: number;
};
export type CatalogPage = { items: CatalogItem[]; nextCursor: string | null; categories: string[]; chargesGst: boolean };

export type CartLine = { key: string; id: string; type: "SERVICE" | "PRODUCT" | "CUSTOM"; name: string; price: number; quantity: number; taxRate: number; stock?: number; description?: string };

export type Hold = { id: string; label: string | null; clientId: string | null; itemCount: number; total: number; createdAt: string; mine: boolean; cart: { lines: Omit<CartLine, "key">[]; discount: number } };

export type Summary = {
  totals: { count: number; total: number; tax: number; units: number; average: number };
  byMethod: { method: string; count: number; amount: number }[];
  top: { name: string; qty: number; amount: number }[];
  recent: { id: string; number: string; at: string; customer: string | null; total: number; method: string | null; status: string }[];
};

export type ClientOption = { id: string; name: string };
