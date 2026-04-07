/**
 * Formats a number-like value into a localized currency string.
 */
export function formatCurrency(
  amount: number | string | { toString(): string } | null | undefined,
  currencyCode: string = "INR",
  locale: string = "en-IN"
): string {
  if (amount === null || amount === undefined) return "—";

  const numericAmount = Number(
    typeof amount === "string"
      ? amount
      : typeof amount === "number"
      ? amount
      : amount.toString()
  );

  if (!Number.isFinite(numericAmount)) return "—";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    return `${currencyCode} ${numericAmount.toFixed(2)}`;
  }
}

export function getCurrencySymbol(currencyCode: string, locale: string = "en-US"): string {
  try {
    return (0).toLocaleString(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).replace(/\d/g, '').trim();
  } catch {
    return currencyCode;
  }
}
