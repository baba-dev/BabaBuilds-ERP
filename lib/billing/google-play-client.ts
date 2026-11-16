import "server-only";

import crypto from "node:crypto";

import type { PlaySubscriptionPurchaseV2 } from "@/lib/billing/play-products";

/**
 * Minimal Google Play Developer API client (androidpublisher v3) using a service account.
 * Implemented with node:crypto + fetch so no heavyweight Google SDK is pulled in.
 *
 * Env:
 *  - GOOGLE_PLAY_PACKAGE_NAME            e.g. com.bababuilds.erp.twa
 *  - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON    service-account key JSON (raw or base64). Needs the
 *                                        "View financial data" + "Manage orders and subscriptions"
 *                                        permissions in Play Console -> Users and permissions.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

export class GooglePlayApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GooglePlayApiError";
  }
}

type ServiceAccount = { client_email: string; private_key: string };

export function isGooglePlayConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLAY_PACKAGE_NAME && process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
}

export function getPlayPackageName(): string {
  const name = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!name) throw new GooglePlayApiError("Google Play billing is not configured (package name).", 503);
  return name;
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new GooglePlayApiError("Google Play billing is not configured (service account).", 503);
  try {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) throw new Error("missing fields");
    return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  } catch {
    throw new GooglePlayApiError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid.", 503);
  }
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** Build the RS256-signed JWT assertion for the service-account OAuth flow. Exported for tests. */
export function buildServiceAccountAssertion(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key);
  return `${header}.${claims}.${b64url(signature)}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const assertion = buildServiceAccountAssertion(loadServiceAccount());
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new GooglePlayApiError("Could not authenticate with Google Play.", res.status === 400 ? 503 : 502);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new GooglePlayApiError("Google Play returned no access token.", 502);
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

async function playFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API}/${encodeURIComponent(getPlayPackageName())}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

/** Authoritative subscription state for a purchase token (purchases.subscriptionsv2.get). */
export async function getSubscriptionPurchaseV2(purchaseToken: string): Promise<PlaySubscriptionPurchaseV2> {
  const res = await playFetch(`purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
  if (res.status === 404 || res.status === 410 || res.status === 400) {
    throw new GooglePlayApiError("Google Play does not recognise this purchase.", 404);
  }
  if (!res.ok) throw new GooglePlayApiError(`Google Play lookup failed (${res.status}).`, 502);
  return (await res.json()) as PlaySubscriptionPurchaseV2;
}

/** Acknowledge a purchase. Unacknowledged purchases are refunded by Google after 3 days. */
export async function acknowledgeSubscription(productId: string, purchaseToken: string): Promise<void> {
  const res = await playFetch(
    `purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", body: "{}" },
  );
  // 400 "already acknowledged" is fine for an idempotent flow.
  if (!res.ok && res.status !== 400) throw new GooglePlayApiError(`Google Play acknowledge failed (${res.status}).`, 502);
}

export function __resetGooglePlayTokenCacheForTests() {
  cachedToken = null;
}
