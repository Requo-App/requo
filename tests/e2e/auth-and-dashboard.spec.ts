import { expect, test, type Page } from "@playwright/test";

import {
  assignIsolatedTestClientIp,
  demoOwnerEmail,
  demoOwnerPassword,
  demoBusinessSlug,
} from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

async function signIn(page: Page) {
  await assignIsolatedTestClientIp(page);
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();

  await page.getByLabel("Email address").fill(demoOwnerEmail);
  await page.locator("#password").fill(demoOwnerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 });
}

async function openDemoBusiness(page: Page) {
  const homePath = `/${demoBusinessSlug}/home`;
  try {
    await page.goto(homePath, { waitUntil: "commit", timeout: 60_000 });
  } catch (error) {
    // A proxy redirect can detach the initial document while Next commits the
    // business route. The URL and visible dashboard navigation confirm it.
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) {
      throw error;
    }
  }
  await expect(page).toHaveURL(
    new RegExp(`${homePath}$`),
    { timeout: 60_000 },
  );
  await expect(
    page.getByRole("link", { name: "Home", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  // The instant shell paints the nav before React hydrates. Wait for the
  // streamed queue so callers do not interact with inert server markup.
  await expect(
    page.getByRole("heading", { name: "Priority queue" }),
  ).toBeVisible({ timeout: 60_000 });

  // Dismiss the onboarding tour if it appears
  const tourSkipButton = page.getByRole("button", { name: "Skip tour" });

  if (await tourSkipButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await tourSkipButton.click();
    await expect(tourSkipButton).toBeHidden();
  }
}

async function openAccountMenu(page: Page) {
  // The top bar can still be hydrating when openDemoBusiness resolves; a click
  // delivered first is a no-op. Retry until the menu actually opens, then let
  // the caller choose an item.
  await expect(async () => {
    await page.getByRole("button").filter({ hasText: demoOwnerEmail }).click();
    await expect(
      page.getByRole("menuitem", { name: "Sign out" }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function expectBodyScrollUnlocked(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.body.hasAttribute("data-scroll-locked")))
    .toBe(false);
}

test("owner can sign in, reach the dashboard overview, and sign out @smoke", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await signIn(page);
  await openDemoBusiness(page);

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
});

test("legacy account profile route redirects into business settings profile", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page);

  await page.goto("/account/profile", {
    waitUntil: "commit",
    timeout: 60_000,
  });

  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/settings/profile$`),
    { timeout: 20_000 },
  );
  // The redirect can land before the settings chunk finishes compiling in dev.
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(
    demoOwnerEmail,
  );
});

test("business settings profile shows the unified account sections", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  await openDemoBusiness(page);

  await page.goto(`/${demoBusinessSlug}/settings/profile`);

  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/settings/profile$`),
    { timeout: 20_000 },
  );
  await expect(page.getByLabel("First Name")).toBeVisible();
  await expect(page.getByLabel("Last Name")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(
    demoOwnerEmail,
  );
  await expect(
    page.getByRole("heading", { name: "Devices" }),
  ).toBeVisible();
  await expect(page.getByText("Danger zone")).toBeVisible();
});

test("dashboard queue filters to inquiries and opens the selected record", async ({
  page,
}) => {
  // The inquiry detail route compiles on first visit in dev.
  test.setTimeout(120_000);
  await signIn(page);
  await openDemoBusiness(page);

  await page.getByRole("button", { name: /^Inquiries/ }).click();
  const inquiryRows = page
    .getByRole("link")
    .filter({ has: page.getByText("Inquiry", { exact: true }) });
  await expect(inquiryRows.first()).toBeVisible();

  const inquiryHref = await inquiryRows.first().getAttribute("href");
  const inquiryName = await inquiryRows.first().locator("span").first().innerText();
  expect(inquiryHref).not.toBeNull();
  expect(inquiryHref).toMatch(new RegExp(`/${demoBusinessSlug}/inquiries/`));
  await page.goto(inquiryHref!, { waitUntil: "commit" });
  await expect(
    page.getByRole("heading", { name: inquiryName, exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(new RegExp(`${inquiryHref}$`), {
    timeout: 20_000,
  });
});

test("dashboard shows a branded not-found state for unknown records", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);

  await page.goto(`/${demoBusinessSlug}/inquiries/does-not-exist`, {
    waitUntil: "commit",
  });

  await expect(
    page.getByText("That dashboard record could not be found."),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Back to overview" })).toBeVisible();
});

for (const record of ["invoices", "payments"] as const) {
  test(`${record} detail rethrows notFound() instead of showing a region skeleton`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signIn(page);

    await page.goto(`/${demoBusinessSlug}/${record}/does-not-exist`, {
      waitUntil: "commit",
    });

    await expect(
      page.getByText("That dashboard record could not be found."),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("link", { name: "Back to overview" }),
    ).toBeVisible();
  });
}

test("authenticated app routes are not stored by browser caches", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);

  const response = await page.request.get(`/${demoBusinessSlug}/home`);

  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("dashboard search keeps the top bar stable after scrolling", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page);
  await openDemoBusiness(page);

  // The search dialog marks the app shell aria-hidden, so the top bar is not
  // reachable through the accessibility tree while the dialog is open.
  const topbar = page.locator("header:visible").first();

  // Wait for the populated queue before scrolling; a short streaming shell is
  // not tall enough to scroll at all.
  await expect(
    page.getByRole("heading", { name: "Priority queue" }),
  ).toBeVisible({ timeout: 60_000 });

  // Stop short of the maximum so a modal's tiny layout adjustment cannot
  // clamp the page upward and masquerade as a jump to the top.
  await page.evaluate(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight - window.innerHeight - 80,
      behavior: "instant",
    });
  });

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

  const scrollBefore = await page.evaluate(() => window.scrollY);
  // Applying the modal scroll lock can shift the page by one scrollbar width.
  // The regression this guards is the 700px+ jump back to the top, not a
  // single-line reflow.
  const maxScrollDrift = 24;
  const topBefore = await topbar.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );

  // Retry the click: in dev the dashboard can finish painting before its
  // client handlers hydrate, and a click that early is discarded.
  await expect(async () => {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Search records" }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expectBodyScrollUnlocked(page);

  const scrollAfter = await page.evaluate(() => window.scrollY);
  const topAfter = await topbar.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );

  expect(Math.abs(topBefore)).toBeLessThanOrEqual(1);
  expect(Math.abs(topAfter)).toBeLessThanOrEqual(1);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(
    maxScrollDrift,
  );

  // Closing the menu must also leave the reader where they were.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search records" })).toBeHidden();
  await expect
    .poll(async () => {
      const scrollAfterClose = await page.evaluate(() => window.scrollY);
      return Math.abs(scrollAfterClose - scrollBefore);
    })
    .toBeLessThanOrEqual(maxScrollDrift);
});

test("quote delivery offers manual options when Requo email is unavailable @smoke", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);

  const quotesPath = `/${demoBusinessSlug}/quotes?status=draft`;
  await page.goto(quotesPath, { waitUntil: "commit", timeout: 60_000 });
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/${demoBusinessSlug}/quotes` &&
      url.searchParams.get("status") === "draft",
    { timeout: 60_000 },
  );

  // Choose a real seeded draft instead of depending on a quote id that the
  // seeder does not guarantee.
  const draftQuoteLink = page.getByRole("link", { name: /Q-\d+/ }).first();
  await expect(draftQuoteLink).toBeVisible({ timeout: 20_000 });
  const quotePath = await draftQuoteLink.getAttribute("href");
  expect(quotePath).not.toBeNull();
  const quoteUrl = new URL(quotePath!, "http://localhost");
  await draftQuoteLink.click();
  await expect(
    page,
  ).toHaveURL((url) => url.pathname === quoteUrl.pathname, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send", exact: true }).click();
  const sendDialog = page.getByRole("dialog", { name: "Send quote" });
  await expect(sendDialog).toBeVisible();
  await expect(
    sendDialog.getByRole("link", { name: "Open email app" }),
  ).toBeVisible();
  await expect(
    sendDialog.getByRole("button", { name: "I'll send it myself" }),
  ).toBeVisible();
  await expect(
    sendDialog.getByRole("button", { name: "Send now" }),
  ).toHaveCount(0);
});
