/** ISO 3166-1 alpha-2 codes. Names come from Intl.DisplayNames, so they exist in every locale without a hand-kept table. */
export const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

const CODE_SET = new Set(COUNTRY_CODES);

/** Spellings people actually type. Everything else is matched against the English country name. */
const ALIASES: Record<string, string> = {
  bharat: "IN", hindustan: "IN", usa: "US", "u s a": "US", "u s": "US", america: "US", "united states of america": "US", uk: "GB", "u k": "GB", england: "GB", scotland: "GB", wales: "GB", "great britain": "GB", britain: "GB",
  uae: "AE", emirates: "AE", "united arab emirates": "AE", dubai: "AE", holland: "NL", "the netherlands": "NL", korea: "KR", "south korea": "KR", "republic of korea": "KR", russia: "RU", "russian federation": "RU", vietnam: "VN", "viet nam": "VN",
  turkey: "TR", turkiye: "TR", czechia: "CZ", "czech republic": "CZ", "hong kong sar": "HK", "ivory coast": "CI", burma: "MM", laos: "LA", "sri lanka": "LK", ceylon: "LK", "saudi": "SA", ksa: "SA", oman: "OM", qatar: "QA",
};

const clean = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

let englishNames: Map<string, string> | null = null;
function names(): Map<string, string> {
  if (englishNames) return englishNames;
  const dn = new Intl.DisplayNames(["en"], { type: "region" });
  englishNames = new Map();
  for (const code of COUNTRY_CODES) {
    const n = dn.of(code);
    if (n && n !== code) englishNames.set(clean(n), code);
  }
  return englishNames;
}

export function isCountryCode(v: string | null | undefined): v is string {
  return !!v && CODE_SET.has(v.toUpperCase());
}

export function countryName(code: string | null | undefined, locale = "en"): string {
  if (!code || !isCountryCode(code)) return code ?? "";
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code; } catch { return code; }
}

/** Edit distance where swapping two neighbouring letters ("Indai" for "India") counts as one mistake. */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

export type CountryMatch = { code: string; exact: boolean };

/**
 * Turns whatever was typed ("india", "IN", "Bharat", "U.S.A.") into an ISO code. A near miss ("Indai") is returned as a
 * non-exact match so the caller can ask "did you mean India?" instead of quietly storing a typo that flips GST treatment.
 */
export function matchCountry(input: string | null | undefined): CountryMatch | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (raw.length === 2 && isCountryCode(raw)) return { code: raw.toUpperCase(), exact: true };
  const c = clean(raw);
  if (!c) return null;
  if (ALIASES[c]) return { code: ALIASES[c], exact: true };
  const byName = names().get(c);
  if (byName) return { code: byName, exact: true };
  if (c.length >= 5) {
    let best: { code: string; d: number } | null = null;
    for (const [n, code] of names()) {
      if (Math.abs(n.length - c.length) > 2) continue;
      const d = distance(c, n);
      if (d <= (c.length >= 8 ? 2 : 1) && (!best || d < best.d)) best = { code, d };
    }
    if (best) return { code: best.code, exact: false };
  }
  return null;
}

/** A client is foreign (an export, zero-rated) when its country differs from the workspace's. */
export const isForeignTo = (workspaceCountry: string | null | undefined, clientCode: string | null | undefined) =>
  !!clientCode && !!workspaceCountry && clientCode.toUpperCase() !== workspaceCountry.toUpperCase();
