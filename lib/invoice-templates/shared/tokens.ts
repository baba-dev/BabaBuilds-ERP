import { rgb } from "pdf-lib";
import type { Color } from "pdf-lib";
import {
  INK,
  MIN_ACCENT_CONTRAST,
  WHITE,
  contrastRatio,
  hslToRgb,
  isAccessibleAccent,
  nearestAccessibleAccent,
  normalizeHexColor,
  rgbToHsl,
  toHex,
  toRgb,
  type AccentSource,
} from "@/lib/invoice-templates/shared/accent-color";

export { MIN_ACCENT_CONTRAST, contrastRatio, isAccessibleAccent, nearestAccessibleAccent, normalizeHexColor };
export type { AccentSource };

export type AccentTokens = {
  hex: string;
  accent: Color;
  accentDark: Color;
  accentTint: Color;
  accentTintStrong: Color;
  onAccent: Color;
};

export const resolveAccent = (input: {
  invoice?: unknown;
  client?: unknown;
  workspace?: unknown;
  designDefault: string;
}): { hex: string; source: AccentSource } => {
  const chain: Array<[AccentSource, unknown]> = [
    ["invoice", input.invoice],
    ["client", input.client],
    ["workspace", input.workspace],
  ];
  for (const [source, value] of chain) {
    const hex = normalizeHexColor(value);
    if (hex) return { hex: nearestAccessibleAccent(hex), source };
  }
  const fallback = normalizeHexColor(input.designDefault) ?? "#0B3D91";
  return { hex: nearestAccessibleAccent(fallback), source: "design" };
};

const toColor = (hex: string): Color => {
  const [r, g, b] = toRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
};

const mixWithWhite = (hex: string, amount: number): string => {
  const [r, g, b] = toRgb(hex);
  return toHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
};

export const buildAccentTokens = (hexInput: string): AccentTokens => {
  const hex = normalizeHexColor(hexInput) ?? "#0B3D91";
  const [h, s, l] = rgbToHsl(toRgb(hex));
  const dark = toHex(hslToRgb([h, s, Math.max(0, l * 0.7)]));
  const onAccent = contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK;
  return {
    hex,
    accent: toColor(hex),
    accentDark: toColor(dark),
    accentTint: toColor(mixWithWhite(hex, 0.92)),
    accentTintStrong: toColor(mixWithWhite(hex, 0.82)),
    onAccent: toColor(onAccent),
  };
};
