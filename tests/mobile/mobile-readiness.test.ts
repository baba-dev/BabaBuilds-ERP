import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getLocale: async () => "en-IN" }));

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("mobile focus routes", () => {
  it("hides the bottom tab bar on composer / POS routes only", async () => {
    const { isFocusRoute } = await import("@/components/layout/mobile-nav");
    for (const p of ["/income/new", "/proposals/new", "/proposals/abc/edit", "/retainers/new", "/retainers/x1/edit", "/pos"]) {
      expect(isFocusRoute(p), p).toBe(true);
    }
    for (const p of ["/dashboard", "/income", "/proposals", "/proposals/abc", "/clients", "/expenses", null]) {
      expect(isFocusRoute(p as string | null), String(p)).toBe(false);
    }
  });

  it("maps a pathname to its sidebar section key (longest path wins)", async () => {
    const { getSectionKey } = await import("@/components/layout/mobile-nav");
    expect(getSectionKey("/proposals/pipeline")).toBe("revenue_pipeline");
    expect(getSectionKey("/proposals/123")).toBe("quotes_proposals");
    expect(getSectionKey("/settings/profile")).toBe("settings");
    expect(getSectionKey("/nope")).toBeNull();
  });
});

describe("web app manifest (Android install / Play)", () => {
  it("ships separate any / maskable / monochrome icons that exist on disk", async () => {
    const manifest = (await import("@/app/manifest")).default;
    const m = await manifest();
    const icons = m.icons ?? [];
    const purposes = (p: string) => icons.filter((i) => (i.purpose ?? "any").split(" ").includes(p));

    expect(purposes("any").map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(purposes("maskable").map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(purposes("monochrome").length).toBeGreaterThan(0);

    // The maskable icon must be its own full-bleed asset, not the transparent-cornered "any" icon.
    const anySrcs = new Set(purposes("any").map((i) => i.src));
    for (const icon of purposes("maskable")) expect(anySrcs.has(icon.src)).toBe(false);

    for (const icon of icons) {
      expect(fs.existsSync(path.join(root, "public", icon.src)), icon.src).toBe(true);
    }
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
  });
});

describe("Trusted Web Activity packaging", () => {
  it("keeps twa-manifest.json and assetlinks.json in agreement", () => {
    const twa = JSON.parse(read("android/twa-manifest.json")) as { packageId: string; host: string; startUrl: string };
    const links = JSON.parse(read("public/.well-known/assetlinks.json")) as Array<{
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    const target = links.find((l) => l.target.namespace === "android_app")?.target;
    expect(target?.package_name).toBe(twa.packageId);
    expect(twa.host).toBe("erp.bababuilds.com");
    expect(twa.startUrl).toBe("/dashboard");
    for (const fp of target?.sha256_cert_fingerprints ?? []) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it("never lets signing material be committed", () => {
    const ignore = read(".gitignore");
    expect(ignore).toMatch(/\/android\/\*\.keystore/);
    expect(ignore).toMatch(/\/android\/\*\.jks/);
  });
});

describe("viewport + layout guards", () => {
  it("uses viewport-fit=cover so safe-area insets work (Android 15 edge-to-edge)", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("viewportFit: 'cover'");
    expect(layout).toContain("interactiveWidget");
    // Pinch-zoom must stay available for accessibility.
    expect(layout).not.toMatch(/maximumScale|userScalable/);
  });

  it("dashboard screens never use 100vh-based heights (use min-h-app / dvh)", () => {
    const offenders = walk(path.join(root, "app/(dashboard)"))
      .filter((f) => /\b(min-h-screen|h-screen|max-h-screen)\b/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("DashboardPageShell header is only sticky from md up (it used to eat the phone viewport)", () => {
    const src = read("components/layout/DashboardPageShell.tsx");
    expect(src).toMatch(/md:sticky/);
    expect(src).not.toMatch(/"sticky top-0 z-20/);
  });
});

describe("Play Store requirements", () => {
  it("settings/security links to the public /delete-account page (in-app deletion entry point)", () => {
    const src = read("app/(dashboard)/settings/security/page.tsx");
    expect(src).toContain('href="/delete-account"');
  });

  it("twa-manifest minSdkVersion satisfies androidbrowserhelper 2.x (24) and shortcuts carry chosenIconUrl", () => {
    const twa = JSON.parse(read("android/twa-manifest.json"));
    expect(twa.minSdkVersion).toBeGreaterThanOrEqual(24);
    for (const s of twa.shortcuts) expect(s.chosenIconUrl, s.name).toMatch(/^https:\/\//);
  });
});

describe("responsive dialog on phones", () => {
  it("lets a long form scroll inside the bottom sheet, so every field and the footer stay reachable", () => {
    const src = read("components/ResponsiveDialog.tsx");
    const mobile = src.slice(src.indexOf("<Drawer open"));
    expect(mobile).toMatch(/className="[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*\boverflow-y-auto\b[^"]*"/);
  });
});
