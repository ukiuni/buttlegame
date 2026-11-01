import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // CI runners have 4 cores; the tests mostly wait on real-time battles, so 4 workers per job is safe
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['dot']] : [['list']],
  use: { baseURL: 'http://127.0.0.1:8123', trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/serve.mjs 8123',   // tiny Node server: no Python needed (works in the Playwright Docker image)
    url: 'http://127.0.0.1:8123/index.html',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'android', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } },
  ],
});
