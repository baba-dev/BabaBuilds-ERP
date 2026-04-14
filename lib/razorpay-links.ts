/**
 * lib/razorpay-links.ts
 * ─────────────────────
 * Isolated server-side service that generates Razorpay Payment Links
 * using a TENANT'S own Razorpay credentials.
 *
 * SAFETY CONTRACT:
 *  - This function NEVER throws. Any failure returns null.
 *  - It NEVER crashes the parent PDF generation process.
 *  - Only INR is supported (Razorpay constraint).
 *  - Only called for PRO-tier workspaces (enforced by caller).
 */

import Razorpay from 'razorpay';

export interface PaymentLinkParams {
  amount: number;          // Total invoice amount in RUPEES (not paise — we convert internally)
  currency: string;        // Must be "INR" (caller should guard this)
  description: string;     // e.g. "Invoice INV/25-26/001"
  invoiceDueDate: Date;    // Used to set expire_by on the payment link
  customerDetails?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  tenantKeyId: string;     // Decrypted Razorpay Key ID
  tenantKeySecret: string; // Decrypted Razorpay Key Secret
}

/**
 * Generates a Razorpay Payment Link for a tenant invoice.
 *
 * @returns The short_url (e.g. "https://rzp.io/i/xxxx") or null on any failure.
 */
export async function generateTenantPaymentLink(
  params: PaymentLinkParams
): Promise<{ url: string; linkId: string } | null> {
  // Guard: Razorpay only supports INR
  if (params.currency !== 'INR') {
    console.warn(
      `[razorpay-links] Skipping payment link — currency "${params.currency}" is not supported. Only INR is allowed.`
    );
    return null;
  }

  // Guard: Validate keys are present
  if (!params.tenantKeyId || !params.tenantKeySecret) {
    console.warn('[razorpay-links] Skipping — tenant key ID or secret is missing.');
    return null;
  }

  try {
    // Race the API call against an 8-second timeout
    const linkPromise = _createLink(params);
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Razorpay API timed out after 8s')), 8000)
    );

    const result = await Promise.race([linkPromise, timeoutPromise]);
    return result;

  } catch (err: unknown) {
    // Silent fail — log and return null, NEVER re-throw
    console.error(
      '[razorpay-links] Payment link generation failed (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/** Internal: calls the Razorpay SDK */
async function _createLink(params: PaymentLinkParams): Promise<{ url: string; linkId: string } | null> {
  const rzp = new Razorpay({
    key_id: params.tenantKeyId,
    key_secret: params.tenantKeySecret,
  });

  // Convert rupees → paise (Razorpay expects integer paise)
  const amountInPaise = Math.round(params.amount * 100);

  // Expiry = invoice due date + 1 day (in Unix seconds) to give the client buffer
  const expireBy = Math.floor(
    new Date(params.invoiceDueDate.getTime() + 24 * 60 * 60 * 1000).getTime() / 1000
  );

  const payload: Record<string, unknown> = {
    amount: amountInPaise,
    currency: params.currency,
    description: params.description,
    expire_by: expireBy,
    callback_url: 'https://erp.bababuilds.com/api/payments/verify-redirect',
    callback_method: 'get',
  };

  // Attach customer details if available
  if (params.customerDetails?.name || params.customerDetails?.email || params.customerDetails?.contact) {
    payload.customer = {
      name: params.customerDetails.name ?? '',
      email: params.customerDetails.email ?? '',
      contact: params.customerDetails.contact ?? '',
    };
  }

  // @ts-expect-error — Razorpay SDK types may lag behind API
  const link = await rzp.paymentLink.create(payload) as Record<string, unknown>;

  const shortUrl = (link?.short_url as string) ?? (link?.shortUrl as string) ?? null;

  if (!shortUrl) {
    console.warn('[razorpay-links] Razorpay returned a link object but no short_url:', link);
    return null;
  }

  return { 
    url: shortUrl as string, 
    linkId: (link?.id as string) || ''
  };
}
