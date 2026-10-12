import path from 'path';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

import { COVERAGE_EXCLUDES } from './vitest.shared';

config({ path: '.env.local' });
config();

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './') },
      {
        find: 'server-only',
        replacement: path.resolve(__dirname, 'node_modules/server-only/empty.js'),
      },
      {
        find: /^next\/server$/,
        replacement: path.resolve(__dirname, 'node_modules/next/server.js'),
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
        'postgresql://postgres:postgres@127.0.0.1:5432/requo',
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
