import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const BASE_HOSTNAME = new URL(BASE_URL).hostname;

const NOISE_HOST_PATTERNS = [
  /fundingchoicesmessages\.google\.com/i,
  /googlesyndication\.com/i,
  /gstatic\.com/i,
];

function isKnownThirdPartyNoise(url: string): boolean {
  return NOISE_HOST_PATTERNS.some((pattern) => pattern.test(url));
}

test.describe("Console hygiene", () => {
  test("critical public routes avoid first-party console errors", async ({ page }) => {
    const firstPartyIssues: string[] = [];

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const sourceUrl = message.location().url || "";
      if (isKnownThirdPartyNoise(sourceUrl)) return;

      const isFirstParty =
        !sourceUrl ||
        sourceUrl.startsWith("/") ||
        (() => {
          try {
            return new URL(sourceUrl).hostname === BASE_HOSTNAME;
          } catch {
            return false;
          }
        })();

      if (isFirstParty) {
        firstPartyIssues.push(`[console.error] ${message.text()} @ ${sourceUrl || "inline"}`);
      }
    });

    page.on("pageerror", (error) => {
      firstPartyIssues.push(`[pageerror] ${error.message}`);
    });

    page.on("requestfailed", (request) => {
      const failedUrl = request.url();
      if (isKnownThirdPartyNoise(failedUrl)) return;
      const isFirstParty = (() => {
        try {
          return new URL(failedUrl).hostname === BASE_HOSTNAME;
        } catch {
          return false;
        }
      })();
      if (isFirstParty) {
        firstPartyIssues.push(
          `[requestfailed] ${request.failure()?.errorText || "unknown"} ${request.method()} ${failedUrl}`,
        );
      }
    });

    for (const route of ["/", "/login", "/help"]) {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `${route} should not 5xx`).toBeLessThan(500);
    }

    expect(firstPartyIssues, firstPartyIssues.join("\n")).toEqual([]);
  });
});
