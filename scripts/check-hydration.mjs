/**
 * Loads a route and reports hydration mismatches and page errors.
 *
 * Usage: node scripts/check-hydration.mjs [path]
 */
import { chromium } from "playwright";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.DEMO_OWNER_EMAIL ?? "user@email.com";
const PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? "12345678";
const PATHNAME = process.argv[2] ?? "/brightside-print-studio/home";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "dark",
});
const page = await context.newPage();

const problems = [];
page.on("console", (message) => {
  const text = message.text();
  if (message.type() === "error" || text.includes("Hydration")) {
    problems.push(`[console:${message.type()}] ${text.slice(0, 400)}`);
  }
});
page.on("pageerror", (error) => {
  problems.push(`[pageerror] ${error.message.slice(0, 400)}`);
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
await page.waitForTimeout(2500);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.press('input[type="password"]', "Enter");
await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 60_000 });

await page.goto(`${BASE}${PATHNAME}`, {
  waitUntil: "domcontentloaded",
  timeout: 120_000,
});
await page.waitForTimeout(8000);

if (problems.length === 0) {
  console.log(`OK — no hydration or page errors on ${PATHNAME}`);
} else {
  console.log(`PROBLEMS on ${PATHNAME}:`);
  for (const problem of problems) console.log(problem);
}

await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
