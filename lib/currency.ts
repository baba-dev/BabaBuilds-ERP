/**
 * Formats a number into a localized currency string.
 * @param amount - The numerical value
 * @param currencyCode - ISO code (e.g., "USD", "INR", "AED")
 * @param locale - The user's locale (e.g., "en-IN", "en-US")
 */
export function formatCurrency(
  amount: number | null | undefined,
  currencyCode: string = "INR",
  locale: string = "en-IN"
): string {
  if (amount === null || amount === undefined) return "—";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (e) {
    // Fallback if locale/currency is invalid
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

/**
 * Returns just the currency symbol for UI labels
 */
export function getCurrencySymbol(currencyCode: string, locale: string = "en-US"): string {
  try {
    return (0).toLocaleString(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).replace(/\d/g, '').trim();
  } catch (e) {
    return currencyCode;
  }
}