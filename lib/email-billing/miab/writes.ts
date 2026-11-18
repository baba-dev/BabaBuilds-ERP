import 'server-only';

import { miabApiUrl, validateMailBillingUrlForFetch } from './guard';

/**
 * The only Mail-in-a-Box endpoints the ERP may write to. Everything else (DNS, TLS, backups, restart, updates,
 * admin privileges, domain removal) is deliberately absent; a test asserts this list.
 */
export const MIAB_WRITE_ENDPOINTS = {
  userAdd: '/mail/users/add',
  userRemove: '/mail/users/remove',
  userPassword: '/mail/users/password',
  userQuota: '/mail/users/quota',
  aliasAdd: '/mail/aliases/add',
  aliasRemove: '/mail/aliases/remove',
} as const;
export type MiabWriteEndpoint = keyof typeof MIAB_WRITE_ENDPOINTS;

export class MiabApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'MiabApiError';
    this.status = status;
  }
}

const WRITE_TIMEOUT_MS = 20_000;
const MAX_ERROR_CHARS = 300;

function basicAuth(token: string | undefined) {
  if (!token || !token.includes(':')) {
    throw new MiabApiError('Managed mode needs a token in the form "admin-email:password-or-api-key".', 400);
  }
  return `Basic ${Buffer.from(token).toString('base64')}`;
}

/** Message safe to store and show: trimmed, single line, and never containing the credential or submitted secrets. */
function safeMessage(text: string, secrets: string[]) {
  let out = text.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_CHARS);
  for (const secret of secrets) if (secret) out = out.split(secret).join('***');
  return out;
}

/**
 * POSTs one form to an allow-listed write endpoint. Throws MiabApiError on any non-2xx answer, with a short message
 * from the server. `form` values listed in `secretFields` are redacted from errors.
 */
export async function miabWrite(opts: {
  baseUrl: string;
  token: string | undefined;
  endpoint: MiabWriteEndpoint;
  form: Record<string, string>;
  secretFields?: string[];
}): Promise<string> {
  const path = MIAB_WRITE_ENDPOINTS[opts.endpoint];
  if (!path) throw new MiabApiError('Endpoint not allowed', 400);
  const auth = basicAuth(opts.token);
  const base = await validateMailBillingUrlForFetch(opts.baseUrl);
  // Redact the whole credential and its password half: a server may echo either.
  const secrets = [opts.token ?? '', (opts.token ?? '').split(':').slice(1).join(':'), ...(opts.secretFields ?? []).map((f) => opts.form[f] ?? '')];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS);
  try {
    const res = await fetch(miabApiUrl(base, path), {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(opts.form).toString(),
      redirect: 'error',
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new MiabApiError(safeMessage(text, secrets) || `Mail server returned ${res.status}`, res.status);
    return safeMessage(text, secrets);
  } catch (error) {
    if (error instanceof MiabApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new MiabApiError('Mail server request timed out', 504);
    throw new MiabApiError(safeMessage(error instanceof Error ? error.message : 'Mail server request failed', secrets), 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Reads /system/version (plain text such as "v70"), used to confirm the credential and record the box version. */
export async function miabReadVersion(opts: { baseUrl: string; token: string | undefined }): Promise<string> {
  const auth = basicAuth(opts.token);
  const base = await validateMailBillingUrlForFetch(opts.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(miabApiUrl(base, '/system/version'), { headers: { Authorization: auth }, redirect: 'error', signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new MiabApiError(`Mail server returned ${res.status}`, res.status);
    return text.trim().slice(0, 40);
  } catch (error) {
    if (error instanceof MiabApiError) throw error;
    throw new MiabApiError(error instanceof Error && error.name === 'AbortError' ? 'Mail server request timed out' : 'Mail server request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}
