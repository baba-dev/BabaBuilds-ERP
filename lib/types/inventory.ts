/** Product as returned by the inventory API (Decimal columns are serialised to numbers). */
export interface InventoryProduct {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  unit: string;
  baselinePrice: number;
  costPrice: number;
  currentStock: number;
  safetyStock: number;
  status?: string;
  barcode?: string | null;
  imageUrl?: string | null;
  location?: string | null;
  showInShop?: boolean;
  shopSortOrder?: number | null;
  shopDescription?: string | null;
  shopImageUrl?: string | null;
}

export interface InventoryMovement {
  id: string;
  quantity: number;
  reason?: string | null;
  createdAt: string;
}
