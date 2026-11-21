/** Currency-formatted amount in the given locale; falls back to "CODE 1,234.00" for codes Intl rejects. */
export const formatMoney = (amount: number, currency: string, locale: string): string => {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    const plain = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    return `${currency} ${plain}`;
  }
};
