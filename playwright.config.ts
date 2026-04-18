import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  testIgnore: ['**/*.test.ts', '**/*.unit.test.ts', '**/*.integration.test.ts'],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? 'html' : 'line',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    env: {
      ...process.env,
      // Dev server smoke runs often have no .env.local; NextAuth session polling must not 500.
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET ||
        'playwright-local-dev-secret-must-be-32chars-min',
      // Playwright runs can create many demo workspaces quickly; relax the demo circuit breaker.
      DEMO_CIRCUIT_BREAKER_THRESHOLD: process.env.DEMO_CIRCUIT_BREAKER_THRESHOLD || '1000',
    },
    // For smoke debugging we want a deterministic server env.
    // Reusing an existing dev server can hide issues (or keep old env vars) across runs.
    reuseExistingServer: true,
    timeout: 120000,
  },
});
