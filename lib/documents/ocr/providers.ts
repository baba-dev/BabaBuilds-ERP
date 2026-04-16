import 'server-only';

export type OcrJobKind = 'RECEIPT' | 'INVOICE' | 'STATEMENT' | 'TAX' | 'GENERIC';

export type DocumentOcrProviderKey = 'UNCONFIGURED';

export type OcrResult = {
  rawText: string;
  fields: Array<{
    fieldKey: string;
    valueText?: string;
    valueNumber?: number;
    valueDate?: string; // ISO
    confidence?: number; // 0..1
  }>;
};

export type OcrProvider = {
  key: DocumentOcrProviderKey;
  run: (params: {
    kind: OcrJobKind;
    mimeType: string;
    bytes: Buffer;
    originalName: string;
  }) => Promise<OcrResult>;
};

export const UnconfiguredOcrProvider: OcrProvider = {
  key: 'UNCONFIGURED',
  async run() {
    return {
      rawText: '',
      fields: [],
    };
  },
};

export function getOcrProvider(key: DocumentOcrProviderKey): OcrProvider {
  if (key === 'UNCONFIGURED') return UnconfiguredOcrProvider;
  return UnconfiguredOcrProvider;
}

