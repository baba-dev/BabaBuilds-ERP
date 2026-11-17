import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

/** Dismiss blocking onboarding / dialog overlay when present. */
export async function dismissBlockingOverlays(page: Page) {
  const overlay = page.locator('[data-slot="dialog-overlay"][data-state="open"]');
  if (!(await overlay.isVisible().catch(() => false))) return;

  await page
    .request.patch("/api/user/onboarding", {
      data: { action: "dismiss" },
      headers: { "Content-Type": "application/json" },
    })
    .catch(() => null);

  const continueButton = page.getByRole("button", { name: /continue/i }).first();
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }

  await expect(overlay).toBeHidden({ timeout: 15000 }).catch(() => {});
}

export async function loginViaDemoSoftwareCompany(page: Page) {
  await page.goto("/login?openSandbox=1&demoTemplate=software_company", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  const softwareCard = page.getByRole("button", { name: /Software Company/i }).first();
  if (await softwareCard.isVisible().catch(() => false)) {
    await softwareCard.click();
  }

  await page.getByTestId("demo-auth-button").click();

  await page.waitForURL(
    (url) => url.pathname.startsWith("/dashboard") || url.pathname.startsWith("/setup"),
    { timeout: 120_000, waitUntil: "domcontentloaded" },
  );
}

/** Reject tiny or near-uniform (blank white) PNGs. */
export function assertPngNotBlank(absPath: string) {
  const buf = readFileSync(absPath);
  if (buf.length < 10_000) {
    throw new Error(`Screenshot too small (${buf.length} bytes): ${absPath}`);
  }
  const png = PNG.sync.read(buf);
  const { data, width, height } = png;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const step = 5;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (width * y + x) << 2;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      sum += lum;
      sumSq += lum * lum;
      n += 1;
    }
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const std = Math.sqrt(variance);
  if (std < 0.035) {
    throw new Error(`Screenshot appears blank (luminance std=${std.toFixed(4)}): ${absPath}`);
  }
}
