import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'tools/simulator/src/**/*.test.ts',
      'tools/scripts/**/*.test.mjs',
    ],
    exclude: ['**/dist/**', '**/node_modules/**', 'tests/federation/**', 'tests/e2e/**'],
    environment: 'node',
    clearMocks: true,
  },
});
