import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_HOST_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
});
