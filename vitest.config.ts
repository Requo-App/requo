import path from 'path';
import { config } from 'dotenv';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { COVERAGE_EXCLUDES } from './tests/vitest.shared';

config({ path: '.env.local' });
config();

/**
 * Vitest config for the unit and component tiers.
 *
 * Environment variables used by tests are seeded centrally in
 * `tests/setup.ts` via `applyTestEnv()`. We intentionally do not repeat them
 * under `test.env` here. Values that should still come from `.env.local` in
 * development are loaded above via `dotenv`.
 *
 * Keep one timeout policy for the unit/component tier. Slow tests should be
 * fixed or explicitly justified at the test declaration when needed.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    testTimeout: 30_000,
    exclude: ['tests/e2e/**', 'tests/integration/**', 'node_modules/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: ['node_modules/**', '.next/**', ...COVERAGE_EXCLUDES],
    },
    alias: {
      '@': path.resolve(__dirname, './'),
      'server-only': path.resolve(__dirname, 'node_modules/server-only/empty.js'),
    },
  },
});
