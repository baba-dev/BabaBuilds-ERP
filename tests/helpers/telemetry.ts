import type { Page, TestInfo } from '@playwright/test';

type Telemetry = {
  consoleErrors: string[];
  consoleWarnings: string[];
  pageErrors: string[];
  failedRequests: string[];
};

export function attachPageTelemetry(page: Page) {
  const telemetry: Telemetry = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
  };

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') telemetry.consoleErrors.push(msg.text());
    if (type === 'warning') telemetry.consoleWarnings.push(msg.text());
  });

  page.on('pageerror', (err) => telemetry.pageErrors.push(err.message));

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    telemetry.failedRequests.push(`${req.method()} ${req.url()} ${failure?.errorText ?? ''}`.trim());
  });

  page.on('response', async (res) => {
    // Useful for catching 4xx/5xx even when the request technically "succeeds" at the network layer.
    const status = res.status();
    if (status >= 400) {
      const req = res.request();
      telemetry.failedRequests.push(`${req.method()} ${res.url()} ${status}`);
    }
  });

  return telemetry;
}

export async function dumpTelemetryOnFailure(testInfo: TestInfo, telemetry: Telemetry) {
  if (testInfo.status === testInfo.expectedStatus) return;

  const lines = [
    '=== Playwright Telemetry ===',
    '',
    `Console errors (${telemetry.consoleErrors.length}):`,
    ...telemetry.consoleErrors.map((l) => `- ${l}`),
    '',
    `Console warnings (${telemetry.consoleWarnings.length}):`,
    ...telemetry.consoleWarnings.map((l) => `- ${l}`),
    '',
    `Page errors (${telemetry.pageErrors.length}):`,
    ...telemetry.pageErrors.map((l) => `- ${l}`),
    '',
    `Failed requests / bad responses (${telemetry.failedRequests.length}):`,
    ...telemetry.failedRequests.map((l) => `- ${l}`),
    '',
  ].join('\n');

  await testInfo.attach('telemetry.txt', { body: lines, contentType: 'text/plain' });
}

