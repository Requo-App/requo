import { defineConfig, devices } from "@playwright/test";

const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const runningAgainstPreview = Boolean(explicitBaseURL);
const port = Number(process.env.PORT ?? "3000");
const localBaseURL = `http://127.0.0.1:${port}`;
const baseURL = explicitBaseURL ?? localBaseURL;
const webServerCommand =
  `npm run db:migrate && npm run db:seed-demo && ` +
  `npm run dev:app -- --hostname 127.0.0.1 --port ${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "reports/playwright.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: runningAgainstPreview
    ? undefined
    : {
        command: webServerCommand,
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
          OPENROUTER_API_KEY: "",
          CLOUDFLARE_ACCOUNT_ID: "",
          CLOUDFLARE_API_TOKEN: "",
          NVIDIA_NIM_API_KEY: "",
          RESEND_API_KEY: "",
          RESEND_FROM_EMAIL: "",
          RESEND_REPLY_TO_EMAIL: "",
          MAILTRAP_API_TOKEN: "",
          BREVO_API_KEY: "",
          UPSTASH_REDIS_REST_URL: "",
          UPSTASH_REDIS_REST_TOKEN: "",
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: localBaseURL,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
