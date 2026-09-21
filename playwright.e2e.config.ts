import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_HOST_URL ?? 'http://127.0.0.1:5173';
const target = new URL(baseURL);
if (target.origin !== 'http://127.0.0.1:5173') {
  throw new Error('The mutating E2E suite requires the isolated local host on 127.0.0.1:5173.');
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1, // The browser sessions deliberately share one simulator/configuration.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/e2e.xml' }]] : [['list']],
});
