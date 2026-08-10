import 'server-only';

export const OCR_CAPABILITY_DISABLED_CODE = 'OCR_CAPABILITY_DISABLED' as const;
export const OCR_CAPABILITY_DISABLED_MESSAGE =
  'Document OCR is disabled because no production provider is configured.' as const;

export type OcrJobKind = 'RECEIPT' | 'INVOICE' | 'STATEMENT' | 'TAX' | 'GENERIC';
export type DocumentOcrProviderKey = string;

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

export type OcrCapability =
  | { enabled: true; provider: OcrProvider }
  | {
      enabled: false;
      code: typeof OCR_CAPABILITY_DISABLED_CODE;
      message: typeof OCR_CAPABILITY_DISABLED_MESSAGE;
    };

export type OcrCapabilityResponse =
  | { enabled: true; provider: DocumentOcrProviderKey }
  | {
      enabled: false;
      code: typeof OCR_CAPABILITY_DISABLED_CODE;
      message: typeof OCR_CAPABILITY_DISABLED_MESSAGE;
    };

export type OcrEnqueuePlan = {
  kind: OcrJobKind;
  status: 'QUEUED';
  provider: DocumentOcrProviderKey;
};

// Production providers must be explicitly implemented and registered here.
// An environment variable alone can never turn an arbitrary provider string into executable behavior.
const CONFIGURED_OCR_PROVIDERS: ReadonlyMap<DocumentOcrProviderKey, OcrProvider> = new Map();

export function resolveOcrCapability(params: {
  providerKey?: string | null;
  providers?: ReadonlyMap<DocumentOcrProviderKey, OcrProvider>;
} = {}): OcrCapability {
  const providerKey = params.providerKey?.trim();
  const provider = providerKey
    ? (params.providers ?? CONFIGURED_OCR_PROVIDERS).get(providerKey)
    : undefined;

  if (!provider || provider.key !== providerKey) {
    return {
      enabled: false,
      code: OCR_CAPABILITY_DISABLED_CODE,
      message: OCR_CAPABILITY_DISABLED_MESSAGE,
    };
  }

  return { enabled: true, provider };
}

export function getOcrCapability(): OcrCapability {
  return resolveOcrCapability({ providerKey: process.env.DOCUMENT_OCR_PROVIDER });
}

export function toOcrCapabilityResponse(capability: OcrCapability): OcrCapabilityResponse {
  return capability.enabled
    ? { enabled: true, provider: capability.provider.key }
    : {
        enabled: false,
        code: capability.code,
        message: capability.message,
      };
}

export function buildOcrEnqueuePlan(
  capability: OcrCapability,
  kind: OcrJobKind,
): OcrEnqueuePlan | null {
  if (!capability.enabled) return null;
  return {
    kind,
    status: 'QUEUED',
    provider: capability.provider.key,
  };
}

export class OcrCapabilityDisabledError extends Error {
  readonly code = OCR_CAPABILITY_DISABLED_CODE;

  constructor(readonly capability: Extract<OcrCapability, { enabled: false }>) {
    super(capability.message);
    this.name = 'OcrCapabilityDisabledError';
  }
}

export function requireOcrCapability(): Extract<OcrCapability, { enabled: true }> {
  const capability = getOcrCapability();
  if (!capability.enabled) throw new OcrCapabilityDisabledError(capability);
  return capability;
}
