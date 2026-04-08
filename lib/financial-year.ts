type FinancialYearClock = 'utc' | 'local';

const toTwoDigitYear = (year: number) => String(year).slice(-2).padStart(2, '0');

/**
 * Returns FY in the format "25-26".
 *
 * Rule:
 * - Jan-Mar => previousYear-currentYear
 * - Apr-Dec => currentYear-nextYear
 */
export const getCurrentFinancialYear = (
  date: Date = new Date(),
  clock: FinancialYearClock = 'utc'
): string => {
  const month = clock === 'utc' ? date.getUTCMonth() + 1 : date.getMonth() + 1;
  const year = clock === 'utc' ? date.getUTCFullYear() : date.getFullYear();

  if (month <= 3) {
    return `${toTwoDigitYear(year - 1)}-${toTwoDigitYear(year)}`;
  }

  return `${toTwoDigitYear(year)}-${toTwoDigitYear(year + 1)}`;
};

