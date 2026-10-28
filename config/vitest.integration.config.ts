import path from 'path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

import { COVERAGE_EXCLUDES } from './vitest.shared';

const rootDir = path.resolve(__dirname, '..');

config({ path: path.join(rootDir, '.env.local') });
config({ path: path.join(rootDir, '.env') });

export default defineConfig({
  root: rootDir,
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The integration suite shares one database and ends with
    // `zzz-residue.test.ts`, which asserts that every fixture cleaned up its
    // rows. Running the files in parallel made that assertion a race: the
    // residue scan could run while another file was still holding fixture
    // rows, and it flagged whichever file happened to still be running.
    // Sequential files make the check deterministic.
    fileParallelism: false,
    alias: [
      { find: '@', replacement: rootDir },
      {
        find: 'server-only',
        replacement: path.join(rootDir, 'node_modules/server-only/empty.js'),
      },
      {
        find: /^next\/server$/,
        replacement: path.join(rootDir, 'node_modules/next/server.js'),
      },
    ],
    server: {
      deps: {
        inline: ['@polar-sh/nextjs'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: ['node_modules/**', '.next/**', ...COVERAGE_EXCLUDES],
    },
    env: {
      BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long-so-zod-passes',
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      EMAIL_DOMAIN: 'example.com',
      EMAIL_FROM_DEFAULT: 'Requo <noreply@example.com>',
      EMAIL_FROM_NOTIFICATIONS: 'Requo Notifications <notifications@example.com>',
      EMAIL_FROM_SYSTEM: 'Requo System <system@example.com>',
      EMAIL_FROM_QUOTES: 'Requo Quotes <quotes@example.com>',
      EMAIL_FROM_SUPPORT: 'Requo Support <support@example.com>',
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-key',
    },
  },
});
