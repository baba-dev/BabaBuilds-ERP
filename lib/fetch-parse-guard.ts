export type ApiErrorEnvelope = {
  error: string;
  code: string;
  details?: unknown;
};

type GuardErrorReason = "network" | "http" | "invalid_json" | "invalid_shape";

export type FetchGuardResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; reason: GuardErrorReason; error: ApiErrorEnvelope; payload?: unknown };

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

export const parseJsonSafely = async (res: Response): Promise<{ ok: true; payload: unknown } | { ok: false }> => {
  try {
    return { ok: true, payload: await res.json() };
  } catch {
    return { ok: false };
  }
};

const normalizeApiError = (payload: unknown, fallback: ApiErrorEnvelope): ApiErrorEnvelope => {
  const payloadObj = asRecord(payload);
  const error = typeof payloadObj?.error === "string" ? payloadObj.error : fallback.error;
  const code = typeof payloadObj?.code === "string" ? payloadObj.code : fallback.code;
  const details = payloadObj?.details;

  return details === undefined ? { error, code } : { error, code, details };
};

export async function guardedFetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  validate: (payload: unknown) => T | null,
  options: {
    networkError: ApiErrorEnvelope;
    invalidJsonError: ApiErrorEnvelope;
    invalidShapeError: ApiErrorEnvelope;
    httpErrorFallback: (status: number) => ApiErrorEnvelope;
  }
): Promise<FetchGuardResult<T>> {
  let res: Response;

  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, reason: "network", error: options.networkError };
  }

  const parsed = await parseJsonSafely(res);
  if (!parsed.ok) {
    return { ok: false, status: res.status, reason: "invalid_json", error: options.invalidJsonError };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      reason: "http",
      error: normalizeApiError(parsed.payload, options.httpErrorFallback(res.status)),
      payload: parsed.payload,
    };
  }

  const data = validate(parsed.payload);
  if (!data) {
    return {
      ok: false,
      status: res.status,
      reason: "invalid_shape",
      error: options.invalidShapeError,
      payload: parsed.payload,
    };
  }

  return { ok: true, status: res.status, data };
}
