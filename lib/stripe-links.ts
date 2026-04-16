/**
 * lib/stripe-links.ts
 * ───────────────────
 * Isolated server-side service that generates a Stripe Payment Link
 * using a TENANT'S own Stripe credentials (BYOK).
 *
 * SAFETY CONTRACT:
 *  - This function NEVER throws. Any failure returns null.
 *  - It NEVER crashes the parent PDF generation process.
 *  - Zero-decimal currencies are handled correctly (no ×100 conversion).
 *  - Only called for PRO-tier workspaces (enforced by caller).
 */

import Stripe from 'stripe';

/**
 * Zero-decimal currencies per Stripe documentation.
 * These should be passed as whole integers (e.g., 500 JPY, not 50000).
 * All other currencies are multiplied by 100 to convert to smallest unit.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'ISK',
]);

/**
 * Converts a major-unit amount to Stripe's required smallest-unit integer.
 * Guards against floating-point errors with Math.round().
 *
 * @example toSmallestUnit(5000, "USD") → 500000   (cents)
 * @example toSmallestUnit(5000, "JPY") → 5000     (yen — zero-decimal)
 * @example toSmallestUnit(99.99, "GBP") → 9999   (pence)
 */
function toSmallestUnit(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(upper)) {
    return Math.round(amount); // Pass as-is for zero-decimal currencies
  }
  return Math.round(amount * 100); // Standard currencies: convert to cents/pence/etc.
}

export interface StripePaymentLinkParams {
  amount: number;           // Invoice total in major currency units (e.g., 5000 = $5000 or ₹5000)
  currency: string;         // ISO 4217 code (e.g., "USD", "INR", "JPY", "EUR")
  description: string;      // e.g., "Invoice INV/25-26/001"
  invoiceNumber: string;    // Used as product name context
  tenantSecretKey: string;  // Decrypted Stripe secret key (sk_live_xxx or sk_test_xxx)
}

/**
 * Generates a Stripe Payment Link for a tenant invoice.
 *
 * Flow: create Product → create Price → create Payment Link → return URL
 *
 * @returns The payment link URL (e.g., "https://buy.stripe.com/xxxx") or null on any failure.
 */
export async function generateStripePaymentLink(
  params: StripePaymentLinkParams
): Promise<{ url: string; linkId: string } | null> {
  // Guard: required fields
  if (!params.tenantSecretKey) {
    console.warn('[stripe-links] Skipping — tenant secret key is missing.');
    return null;
  }
  if (!params.amount || params.amount <= 0) {
    console.warn('[stripe-links] Skipping — invalid amount:', params.amount);
    return null;
  }
  if (!params.currency) {
    console.warn('[stripe-links] Skipping — currency is missing.');
    return null;
  }

  try {
    // Race the full Stripe API chain against a 10-second timeout
    const linkPromise = _createStripeLink(params);
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Stripe API timed out after 10s')), 10000)
    );

    return await Promise.race([linkPromise, timeoutPromise]);

  } catch (err: unknown) {
    // Silent fail — log and return null, NEVER re-throw
    // Includes auth errors (invalid key), network errors, and timeout
    console.error(
      '[stripe-links] Payment link generation failed (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/** Internal: executes the 3-step Stripe API chain */
async function _createStripeLink(params: StripePaymentLinkParams): Promise<{ url: string; linkId: string } | null> {
  const stripe = new Stripe(params.tenantSecretKey, {
    // Use the latest stable API version
    apiVersion: '2026-03-25.dahlia',
  });

  const unitAmount = toSmallestUnit(params.amount, params.currency);

  // Step 1: Create a one-off product for this invoice
  const product = await stripe.products.create({
    name: params.description,
    metadata: {
      invoiceNumber: params.invoiceNumber,
    },
  });

  // Step 2: Create a price for that product
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmount,
    currency: params.currency.toLowerCase(),
  });

  // Step 3: Create the Payment Link
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [
      {
        price: price.id,
        quantity: 1,
      },
    ],
    metadata: {
      invoiceNumber: params.invoiceNumber,
    },
    after_completion: {
      type: 'redirect',
      redirect: {
        // NOTE: We must include `link_id` to let verify-redirect bootstrap the workspace secret.
        // PaymentLink ID isn't available until after creation, so we patch the URL in a follow-up update.
        url: 'https://erp.bababuilds.com/api/payments/verify-redirect?session_id={CHECKOUT_SESSION_ID}&gateway=stripe',
      },
    },
  });

  // Patch the redirect URL with link_id so verification can find the invoice/workspace.
  try {
    await stripe.paymentLinks.update(paymentLink.id, {
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://erp.bababuilds.com/api/payments/verify-redirect?session_id={CHECKOUT_SESSION_ID}&gateway=stripe&link_id=${paymentLink.id}`,
        },
      },
    });
  } catch (err) {
    // Non-fatal: cron sync can still mark invoice paid later.
    console.error(
      '[stripe-links] Failed to patch redirect URL with link_id (non-fatal):',
      err instanceof Error ? err.message : String(err)
    );
  }

  const url = paymentLink.url ?? null;

  if (!url) {
    console.warn('[stripe-links] Stripe returned a payment link object but no URL:', paymentLink);
    return null;
  }

  return {
    url,
    linkId: paymentLink.id,
  };
}
