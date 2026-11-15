
const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? undefined : Number(v));
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : undefined);

export function parseProductForm(fd: FormData) {
  return {
    sku: str(fd.get('sku')), name: str(fd.get('name')), description: str(fd.get('description')), category: str(fd.get('category')), unit: str(fd.get('unit')) || undefined,
    baselinePrice: num(fd.get('baselinePrice')), costPrice: num(fd.get('costPrice')), safetyStock: num(fd.get('safetyStock')), reorderQuantity: num(fd.get('reorderQuantity')),
    leadTimeDays: num(fd.get('leadTimeDays')), preferredVendorId: str(fd.get('preferredVendorId')), barcode: str(fd.get('barcode')), location: str(fd.get('location')),
  };
}

