/**
 * Screenshot helper for the analytics redesign.
 *
 * Usage: node scripts/analytics-screenshots.mjs [outDir] [--light] [--empty]
 * Logs in as the seeded owner and captures the analytics page at the widths
 * the brief asks for.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.DEMO_OWNER_EMAIL ?? "user@email.com";
const PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? "12345678";
const SLUG = process.env.DEMO_BUSINESS_SLUG ?? "brightside-print-studio";
const args = process.argv.slice(2);
const OUT = args.find((arg) => !arg.startsWith("--")) ?? "/tmp/opencode/analytics";
const LIGHT = args.includes("--light");
const EMPTY = args.includes("--empty");
const TABS = EMPTY ? ["overview"] : ["overview", "performance", "operations", "team"];
const WIDTHS = EMPTY ? [1440] : [1440, 1024, 768, 390];
const QUERY = EMPTY
  ? "&range=custom&from=2026-01-05&to=2026-01-20"
  : "";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: LIGHT ? "light" : "dark",
});
const page = await context.newPage();

page.on("pageerror", (error) => {
  const message = error.message;
  if (message.includes("Hydration failed")) return;
  console.log("PAGE ERROR:", message.slice(0, 300));
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
await page.waitForTimeout(2500);
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.press('input[type="password"]', "Enter");
await page.waitForURL((url) => !url.pathname.includes("login"), {
  timeout: 60_000,
});
console.log("signed in ->", page.url());

const suffix = `${LIGHT ? "-light" : ""}${EMPTY ? "-empty" : ""}`;

for (const tab of TABS) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${BASE}/${SLUG}/analytics?tab=${tab}${QUERY}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(7000);
    await page.screenshot({
      path: `${OUT}/${tab}-${width}${suffix}.png`,
      fullPage: true,
    });
    console.log("captured", tab, width);
  }
}

await browser.close();
