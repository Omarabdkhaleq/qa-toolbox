import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.BASE_URL;
const baseURL = externalBaseUrl ?? 'http://localhost:4173';
const notFunctional = ['**/perf.spec.ts', '**/container/**'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: notFunctional },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: notFunctional },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: notFunctional },
    { name: 'perf', use: { ...devices['Desktop Chrome'] }, testMatch: '**/perf.spec.ts' },
    {
      name: 'container',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/container/**/*.spec.ts',
    },
  ],
});
