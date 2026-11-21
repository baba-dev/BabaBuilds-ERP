import { describe, expect, it } from "vitest";

import {
  buildAccentTokens,
  contrastRatio,
  isAccessibleAccent,
  nearestAccessibleAccent,
  normalizeHexColor,
  resolveAccent,
} from "@/lib/invoice-templates/shared/tokens";

describe("normalizeHexColor", () => {
  it("normalises valid values to uppercase #RRGGBB", () => {
    expect(normalizeHexColor("#fff")).toBe("#FFFFFF");
    expect(normalizeHexColor("1a2b3c")).toBe("#1A2B3C");
    expect(normalizeHexColor("  #0b5fff ")).toBe("#0B5FFF");
  });

  it("rejects junk", () => {
    for (const bad of ["red", "#GGGGGG", "", "#12", "#1234567", null, undefined, 42, {}]) {
      expect(normalizeHexColor(bad)).toBeNull();
    }
  });
});

describe("contrast", () => {
  it("computes WCAG contrast ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("flags light accents as inaccessible and darkens them", () => {
    expect(isAccessibleAccent("#FFFF00")).toBe(false);
    expect(isAccessibleAccent("#0B5FFF")).toBe(true);
    const fixed = nearestAccessibleAccent("#FFFF00");
    expect(isAccessibleAccent(fixed)).toBe(true);
    expect(fixed).not.toBe("#FFFF00");
    expect(nearestAccessibleAccent("#0B5FFF")).toBe("#0B5FFF");
  });
});

describe("resolveAccent", () => {
  const designDefault = "#0B3D91";

  it("prefers invoice, then client, then workspace, then the design default", () => {
    expect(resolveAccent({ invoice: "#111111", client: "#222222", workspace: "#333333", designDefault })).toEqual({ hex: "#111111", source: "invoice" });
    expect(resolveAccent({ client: "#222222", workspace: "#333333", designDefault })).toEqual({ hex: "#222222", source: "client" });
    expect(resolveAccent({ workspace: "#333333", designDefault })).toEqual({ hex: "#333333", source: "workspace" });
    expect(resolveAccent({ designDefault })).toEqual({ hex: designDefault, source: "design" });
  });

  it("skips invalid values and keeps going down the chain", () => {
    expect(resolveAccent({ invoice: "red", client: "#222222", designDefault })).toEqual({ hex: "#222222", source: "client" });
    expect(resolveAccent({ invoice: "", client: null, workspace: "#GGGGGG", designDefault })).toEqual({ hex: designDefault, source: "design" });
  });

  it("darkens an inaccessible colour but keeps its source", () => {
    const result = resolveAccent({ invoice: "#FFFF00", designDefault });
    expect(result.source).toBe("invoice");
    expect(isAccessibleAccent(result.hex)).toBe(true);
    expect(result.hex).not.toBe("#FFFF00");
  });
});

describe("buildAccentTokens", () => {
  it("never produces NaN colour channels", () => {
    for (const hex of ["#000000", "#FFFFFF", "#FFFF00", "#0B5FFF"]) {
      const t = buildAccentTokens(hex);
      for (const c of [t.accent, t.accentDark, t.accentTint, t.accentTintStrong, t.onAccent]) {
        const channels = [(c as { red: number }).red, (c as { green: number }).green, (c as { blue: number }).blue];
        for (const ch of channels) {
          expect(Number.isFinite(ch)).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("picks white text on dark accents and dark text on light accents", () => {
    const dark = buildAccentTokens("#0B3D91").onAccent as { red: number };
    expect(dark.red).toBeCloseTo(1, 5);
    const light = buildAccentTokens("#FFE066").onAccent as { red: number };
    expect(light.red).toBeLessThan(0.3);
  });
});
