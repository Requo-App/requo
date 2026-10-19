import { expect, test, type Page } from "@playwright/test";

import {
  demoBusinessSlug,
  demoQuotePublicToken,
  // The seed hardcodes the primary owner as user@email.com / 12345678
  // (scripts/seed.ts); DEMO_OWNER_* only overrides the display name.
  seededNonAdminEmail as demoOwnerEmail,
  seededNonAdminPassword as demoOwnerPassword,
} from "../e2e/fixtures";

/**
 * Fallback README screenshots. Each test saves one PNG into
 * public/screenshots/.
 *
 * The committed images come from the native Windows capture
 * (`npm run screenshots`, scripts/marketing/capture-readme-screenshots.mjs);
 * this spec is the portable path for machines without Windows Chrome and
 * renders the same screens at 1x with Playwright's bundled Chromium.
 *
 * Run with `npm run screenshots:fallback` (or against a running server with
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port>).
 */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // Let the dev "Compiling" pill clear so shots are clean.
  await page
    .locator("text=Compiling")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => {});
  // Screenshots show the product, not the dev harness: hide the Next.js dev
  // tools portal (status pill, issue counter, overlay launcher). App UI such
  // as notification toasts is left untouched.
  await page
    .addStyleTag({ content: "nextjs-portal{display:none!important}" })
    .catch(() => {});
  await page.waitForTimeout(1_500);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email address").fill(demoOwnerEmail);
  await page.locator("#password").fill(demoOwnerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
}

async function dismissTour(page: Page) {
  const tourSkipButton = page.getByRole("button", { name: "Skip tour" });

  if (await tourSkipButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await tourSkipButton.click();
    await expect(tourSkipButton).toBeHidden();
  }
}

test("landing page", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/");
  await settle(page);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: "public/screenshots/landing.png" });
});

test("dashboard home", async ({ page }) => {
  test.setTimeout(120_000);

  await signIn(page);
  await page.goto(`/${demoBusinessSlug}/home`);
  await dismissTour(page);
  await expect(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible({ timeout: 20_000 });
  await settle(page);
  await page.screenshot({ path: "public/screenshots/dashboard-home.png" });
});

test("inquiries inbox", async ({ page }) => {
  test.setTimeout(120_000);

  await signIn(page);
  // Land on the dashboard first: it lets the post-login redirect settle so
  // the inquiries navigation below is not superseded mid-flight (ERR_ABORTED).
  await page.goto(`/${demoBusinessSlug}/home`, { waitUntil: "commit" });
  await dismissTour(page);
  await expect(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible({ timeout: 20_000 });
  await page.goto(`/${demoBusinessSlug}/inquiries`, {
    waitUntil: "commit",
  });
  await dismissTour(page);
  await expect(
    page.locator("main").getByRole("heading", { name: "Inquiries" }),
  ).toBeVisible({ timeout: 20_000 });
  await settle(page);
  await page.screenshot({ path: "public/screenshots/inquiries.png" });
});

test("public quote page", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(`/quote/${demoQuotePublicToken}`);
  await settle(page);
  await page.screenshot({ path: "public/screenshots/public-quote.png" });
});
