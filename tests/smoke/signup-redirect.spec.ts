import { expect, test } from "@playwright/test";

test.describe("Signup intent bridge", () => {
  test("signup redirects to login without waiting for client hydration", async ({ page }) => {
    const startedAt = Date.now();

    const response = await page.goto("/signup?plan=pro&cycle=monthly&trial=15&source=smoke_test", {
      waitUntil: "commit",
    });

    expect(response?.status()).toBeLessThan(400);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("callbackUrl=");
    expect(Date.now() - startedAt).toBeLessThan(8_000);
  });
});
