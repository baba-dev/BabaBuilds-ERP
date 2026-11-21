/** Pure hex-colour helpers (no pdf-lib), safe to import from schemas and client code. */
import { z } from "zod";

/** Minimum contrast ratio of an accent against white (accents are used as text, rules and fills). */
export const MIN_ACCENT_CONTRAST = 3;

export type AccentSource = "invoice" | "client" | "workspace" | "design";

export type Rgb = [number, number, number];

export const WHITE = "#FFFFFF";
export const INK = "#1A1A1A";

export const normalizeHexColor = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split("").map((c) => c + c).join("").toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;
  return null;
};

export const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const luminance = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (hexA: string, hexB: string): number => {
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

export const isAccessibleAccent = (hex: string): boolean => contrastRatio(hex, WHITE) >= MIN_ACCENT_CONTRAST;

export const rgbToHsl = ([r, g, b]: Rgb): [number, number, number] => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h /= 6;
  return [h, s, l];
};

export const hslToRgb = ([h, s, l]: [number, number, number]): Rgb => {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const x = (t + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
};

export const nearestAccessibleAccent = (hex: string): string => {
  if (isAccessibleAccent(hex)) return hex;
  const [h, s, l] = rgbToHsl(toRgb(hex));
  for (let lightness = l; lightness > 0; lightness -= 0.01) {
    const candidate = toHex(hslToRgb([h, s, Math.max(0, lightness)]));
    if (isAccessibleAccent(candidate)) return candidate;
  }
  return "#000000";
};

/** Zod field for a brand colour: "" / null clear it, a valid hex is stored as #RRGGBB, anything else is rejected. */
export const accentColorField = z
  .string()
  .trim()
  .max(9)
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const hex = normalizeHexColor(v);
    if (!hex) {
      ctx.addIssue({ code: "custom", message: "ACCENT" });
      return z.NEVER;
    }
    return hex;
  });
