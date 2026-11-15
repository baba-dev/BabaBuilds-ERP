import { productFieldsSchema } from './schemas';

export type ImportRow = Record<string, string | number | null | undefined>;
export type ImportPlan = {
  create: { row: number; sku: string; name: string; openingStock: number }[];
  update: { row: number; sku: string; name: string }[];
  errors: { row: number; sku: string; message: string }[];
  valid: { row: number; fields: ReturnType<typeof productFieldsSchema.parse>; openingStock: number; existing: boolean; gst: { hsnCode: string | null; gstRate: number | null } }[];
};

const num = (v: ImportRow[string]) => (v === undefined || v === null || v === '' ? undefined : Number(String(v).replace(/,/g, '')));

/**
 * Checks spreadsheet rows against the product rules and the SKUs already in the workspace.
 * Existing SKUs are updated (stock is never overwritten by an import; use a stock count for that); new ones are created with opening stock.
 */
export function planImport(rows: ImportRow[], existingSkus: Set<string>): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], errors: [], valid: [] };
  const seen = new Set<string>();
  rows.forEach((raw, i) => {
    const row = i + 2; // spreadsheet row, counting the header
    const sku = String(raw.sku ?? '').trim().toUpperCase();
    if (!sku && !raw.name) return;
    if (seen.has(sku)) { plan.errors.push({ row, sku, message: 'Duplicate SKU in this file.' }); return; }
    seen.add(sku);
    const stock = num(raw.stock);
    if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) { plan.errors.push({ row, sku, message: 'Stock must be a whole number of zero or more.' }); return; }
    const parsed = productFieldsSchema.safeParse({
      sku, name: raw.name, description: raw.description, category: raw.category, unit: raw.unit || undefined, baselinePrice: num(raw.price), costPrice: num(raw.cost),
      safetyStock: num(raw.safetyStock), reorderQuantity: num(raw.reorderQuantity), leadTimeDays: num(raw.leadTimeDays), barcode: raw.barcode, location: raw.location,
    });
    if (!parsed.success) { plan.errors.push({ row, sku, message: parsed.error.issues[0]?.message ?? 'Invalid row.' }); return; }
    const rate = num(raw.gstRate);
    if (rate !== undefined && (Number.isNaN(rate) || rate < 0 || rate > 100)) { plan.errors.push({ row, sku, message: 'GST rate must be between 0 and 100.' }); return; }
    const existing = existingSkus.has(parsed.data.sku);
    const hsn = String(raw.hsnCode ?? '').trim() || null;
    plan.valid.push({ row, fields: parsed.data, openingStock: existing ? 0 : stock ?? 0, existing, gst: { hsnCode: hsn, gstRate: rate ?? null } });
    if (existing) plan.update.push({ row, sku: parsed.data.sku, name: parsed.data.name });
    else plan.create.push({ row, sku: parsed.data.sku, name: parsed.data.name, openingStock: stock ?? 0 });
  });
  return plan;
}

export const IMPORT_COLUMNS = ['sku', 'name', 'category', 'unit', 'cost', 'price', 'stock', 'safetyStock', 'reorderQuantity', 'leadTimeDays', 'hsnCode', 'gstRate', 'barcode', 'location', 'description'] as const;
