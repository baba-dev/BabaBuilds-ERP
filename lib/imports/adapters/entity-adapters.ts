import type { FieldDefinition, ImportEntityKey } from '@/lib/imports/core/types';

export type ImportAdapter = {
  entity: ImportEntityKey;
  label: string;
  description: string;
  fields: FieldDefinition[];
  previewColumns: string[];
  sampleRow: Record<string, string>;
};

export const IMPORT_ADAPTERS: Record<ImportEntityKey, ImportAdapter> = {
  clients: {
    entity: 'clients',
    label: 'Clients',
    description: 'Import customer and account master records.',
    fields: [
      { key: 'name', label: 'Name', required: true, synonyms: ['client', 'client name', 'customer name'] },
      { key: 'email', label: 'Email', synonyms: ['mail', 'email address'] },
      { key: 'phone', label: 'Phone', synonyms: ['mobile', 'phone number'] },
      { key: 'address', label: 'Address', synonyms: ['street', 'location'] },
      { key: 'country', label: 'Country', synonyms: ['nation'] },
      { key: 'taxId', label: 'Tax ID', synonyms: ['gstin', 'vat', 'tax number'] },
      { key: 'notes', label: 'Notes', synonyms: ['remark', 'comments'] },
    ],
    previewColumns: ['name', 'email', 'phone', 'country', 'taxId'],
    sampleRow: { name: 'Acme Ventures', email: 'finance@acme.com', phone: '+1 555 0101', address: '1 Main St', country: 'US', taxId: 'GST1234', notes: 'Priority account' },
  },
  services: {
    entity: 'services',
    label: 'Services',
    description: 'Import service templates and pricing defaults.',
    fields: [
      { key: 'name', label: 'Name', required: true, synonyms: ['service name'] },
      { key: 'code', label: 'Code', synonyms: ['slug', 'service code'] },
      { key: 'description', label: 'Description', synonyms: ['details'] },
      { key: 'defaultPrice', label: 'Default Price', synonyms: ['price', 'rate'] },
      { key: 'taxRate', label: 'Tax Rate', synonyms: ['tax', 'gst rate', 'vat rate'] },
      { key: 'active', label: 'Active', synonyms: ['enabled', 'is active'] },
    ],
    previewColumns: ['name', 'code', 'defaultPrice', 'taxRate', 'active'],
    sampleRow: { name: 'Monthly SEO Retainer', code: 'SEO-MONTHLY', description: 'Search optimization services', defaultPrice: '1200', taxRate: '18', active: 'true' },
  },
  shop_items: {
    entity: 'shop_items',
    label: 'Shop Items',
    description: 'Import storefront-ready product listings.',
    fields: [
      { key: 'name', label: 'Name', required: true, synonyms: ['item name', 'product name'] },
      { key: 'sku', label: 'SKU', synonyms: ['code', 'item code'] },
      { key: 'description', label: 'Description' },
      { key: 'price', label: 'Price', synonyms: ['unit price', 'mrp'] },
      { key: 'category', label: 'Category' },
      { key: 'active', label: 'Active', synonyms: ['enabled'] },
      { key: 'taxRate', label: 'Tax Rate', synonyms: ['tax'] },
    ],
    previewColumns: ['name', 'sku', 'price', 'category', 'active'],
    sampleRow: { name: 'Ergonomic Keyboard', sku: 'KEY-001', description: 'Low-profile wireless keyboard', price: '299', category: 'Peripherals', active: 'true', taxRate: '18' },
  },
  inventory: {
    entity: 'inventory',
    label: 'Inventory',
    description: 'Import product SKU catalog and stock balances.',
    fields: [
      { key: 'sku', label: 'SKU', required: true, synonyms: ['item code'] },
      { key: 'name', label: 'Name', required: true, synonyms: ['product name'] },
      { key: 'description', label: 'Description' },
      { key: 'currentStock', label: 'Current Stock', synonyms: ['stock', 'qty'] },
      { key: 'reorderLevel', label: 'Reorder Level', synonyms: ['safety stock'] },
      { key: 'unitCost', label: 'Unit Cost', synonyms: ['cost price'] },
      { key: 'sellingPrice', label: 'Selling Price', synonyms: ['price', 'baseline price'] },
      { key: 'category', label: 'Category' },
      { key: 'active', label: 'Active', synonyms: ['enabled'] },
    ],
    previewColumns: ['sku', 'name', 'currentStock', 'unitCost', 'sellingPrice'],
    sampleRow: { sku: 'CHAIR-001', name: 'Office Chair', description: 'Mesh ergonomic chair', currentStock: '24', reorderLevel: '5', unitCost: '59', sellingPrice: '99', category: 'Furniture', active: 'true' },
  },
  proposals: {
    entity: 'proposals',
    label: 'Proposals',
    description: 'Import proposal headers (line items intentionally out of scope for v1).',
    fields: [
      { key: 'proposalNo', label: 'Proposal No', synonyms: ['proposal number'] },
      { key: 'clientName', label: 'Client Name', synonyms: ['client'] },
      { key: 'clientEmail', label: 'Client Email', synonyms: ['client email'] },
      { key: 'title', label: 'Title', required: true },
      { key: 'status', label: 'Status', synonyms: ['stage'] },
      { key: 'dateCreated', label: 'Date Created', synonyms: ['created date'] },
      { key: 'validUntil', label: 'Valid Until', synonyms: ['expiry'] },
      { key: 'totalAmount', label: 'Total Amount', synonyms: ['amount'] },
      { key: 'notes', label: 'Notes' },
    ],
    previewColumns: ['proposalNo', 'clientName', 'title', 'status', 'totalAmount'],
    sampleRow: { proposalNo: 'PR-2026-001', clientName: 'Acme Ventures', clientEmail: 'finance@acme.com', title: 'Digital Growth Plan', status: 'DRAFT', dateCreated: '2026-04-01', validUntil: '2026-05-01', totalAmount: '5000', notes: 'Header import only in v1' },
  },
  expenses: {
    entity: 'expenses',
    label: 'Expenses',
    description: 'Import operating expenses and vendor spends.',
    fields: [
      { key: 'vendor', label: 'Vendor', synonyms: ['supplier'] },
      { key: 'amount', label: 'Amount', required: true, synonyms: ['total', 'value'] },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      { key: 'date', label: 'Date', synonyms: ['expense date'] },
      { key: 'taxAmount', label: 'Tax Amount', synonyms: ['tax'] },
      { key: 'taxRate', label: 'Tax Rate' },
      { key: 'paymentMethod', label: 'Payment Method', synonyms: ['method'] },
    ],
    previewColumns: ['vendor', 'amount', 'category', 'date', 'paymentMethod'],
    sampleRow: { vendor: 'CloudHost Inc', amount: '149.00', category: 'Software', description: 'Hosting plan', date: '2026-04-12', taxAmount: '0', taxRate: '0', paymentMethod: 'Card' },
  },
};

export function getImportAdapter(entity: ImportEntityKey): ImportAdapter {
  return IMPORT_ADAPTERS[entity];
}
