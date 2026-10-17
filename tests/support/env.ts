/**
 * Seeds deterministic `Test_Secret_Placeholder` values into `process.env` so that
 * modules which read required environment variables at import time (Better Auth,
 * encryption helpers, database clients, Supabase, etc.) can resolve during test
 * runs without depending on any real secret store.
 *
 * Rules (see requirements 2.9, 11.1, 11.3):
 *  - Only set a value when `process.env[key]` is currently `undefined`.
 *  - Never overwrite a value supplied by the caller, including an explicit
 *    empty string. An empty string from the caller is treated as an intentional
 *    opt-out and is preserved.
 */
export function applyTestEnv(): void {
  const defaults: Record<string, string> = {
    BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long-so-zod-passes',
    APP_ENCRYPTION_KEYS: 'v1:AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
    APP_TOKEN_HASH_SECRET: 'test-token-hash-secret-at-least-32-characters',
    BETTER_AUTH_URL: 'http://127.0.0.1:3000',
    NEXT_PUBLIC_BETTER_AUTH_URL: 'http://127.0.0.1:3000/api/auth',
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    RESEND_API_KEY: '',
    GROQ_API_KEY: '',
    GEMINI_API_KEY: '',
    CEREBRAS_API_KEY: '',
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
