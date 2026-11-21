const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const belowHundred = (n: number): string => {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
};

const belowThousand = (n: number): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
};

/** Indian grouping: crore, lakh, thousand, then the last three digits. */
const integerInWords = (n: number): string => {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  return [
    crore ? `${integerInWords(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    rest ? belowThousand(rest) : "",
  ].filter(Boolean).join(" ");
};

/** "Rupees ... Only" for INR amounts; null for other currencies or amounts that cannot be written out. */
export const amountInWords = (amount: number, currency: string): string | null => {
  if (currency !== "INR") return null;
  if (!Number.isFinite(amount) || amount < 0 || amount >= 1e13) return null;
  const totalPaise = Math.round(amount * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  const paiseWords = paise ? ` and ${belowHundred(paise)} Paise` : "";
  return `Rupees ${integerInWords(rupees)}${paiseWords} Only`;
};
