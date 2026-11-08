/** GST state / UT codes (as used in GSTINs and "place of supply"). */
export const GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

/** Place of supply used for exports of goods/services. */
export const FOREIGN_POS = "96";

const BY_CODE = new Map(GST_STATES.map((s) => [s.code, s.name]));

export function stateName(code: string | null | undefined): string {
  if (!code) return "";
  if (code === FOREIGN_POS) return "Outside India";
  return BY_CODE.get(code) ?? code;
}

export function isStateCode(code: string | null | undefined): code is string {
  return !!code && BY_CODE.has(code);
}

/**
 * QRMP GSTR-3B due-date category: "Category X" states file by the 22nd, all other states/UTs by the 24th.
 * (CGST Notification 83/2020 and subsequent; verify against the latest notification before filing.)
 */
const CATEGORY_X = new Set(["22", "23", "24", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37"]);

export function qrmpGstr3bDueDay(stateCode: string | null | undefined): 22 | 24 {
  return stateCode && CATEGORY_X.has(stateCode) ? 22 : 24;
}
