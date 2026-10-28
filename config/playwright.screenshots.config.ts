import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Fallback screenshots config for README and marketing assets.
 *
 * The committed README images come from the native Windows capture
 * (`npm run screenshots`, scripts/marketing/capture-readme-screenshots.mjs),
 * which renders them in the browser a reader actually uses, at 2x. This
 * config is the portable path for machines without Windows Chrome: it
 * captures the same four screens with Playwright's bundled Chromium at 1x,
 * so the glyph rendering and the resolution differ from the committed set.
 *
 * Self-contained like the e2e config: unless PLAYWRIGHT_BASE_URL is set, it
 * migrates + reseeds the local database and starts the dev server itself, so
 * `npm run screenshots:fallback` works from a clean checkout (needs Docker
 * for the local database — see docs/setup/local.md).
 *
 * Screenshots land in public/screenshots/ via explicit paths in
 * tests/screenshots/*.spec.ts.
 */
const rootDir = path.resolve(__dirname, "..");
const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const runningAgainstPreview = Boolean(explicitBaseURL);
const port = Number(process.env.PORT ?? "3101");
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = explicitBaseURL ?? localBaseURL;
const webServerCommand =
  `npm run db:migrate && npm run db:seed-demo && ` +
  `npm run dev:app -- --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "../tests/screenshots",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: runningAgainstPreview
    ? undefined
    : {
        command: webServerCommand,
        cwd: rootDir,
        env: {
          ...process.env,
          APP_TOKEN_HASH_SECRET:
            process.env.APP_TOKEN_HASH_SECRET ??
            "test-token-hash-secret-at-least-32-characters",
          BETTER_AUTH_URL: localBaseURL,
          DISABLE_TRANSACTIONAL_EMAILS: "1",
          NEXT_PUBLIC_BETTER_AUTH_URL: `${localBaseURL}/api/auth`,
          GROQ_API_KEY: "",
          GEMINI_API_KEY: "",
          RESEND_API_KEY: "",
          RESEND_FROM_EMAIL: "",
          RESEND_REPLY_TO_EMAIL: "",
        },
        reuseExistingServer: false,
        timeout: 180_000,
        url: localBaseURL,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
