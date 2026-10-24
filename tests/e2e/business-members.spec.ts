import { expect, test, type Page } from "@playwright/test";

import {
  assignIsolatedTestClientIp,
  demoBusinessSlug,
  demoManagerEmail,
  demoManagerPassword,
  demoOutsiderEmail,
  demoOutsiderPassword,
  demoOwnerEmail,
  demoOwnerPassword,
  demoPendingInviteEmail,
  demoPendingInvitePassword,
  demoPendingInviteToken,
  demoStaffEmail,
  demoStaffPassword,
} from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

test.describe.configure({ mode: "serial" });

async function signIn(
  page: Page,
  email: string,
  password: string,
  expectedUrl: RegExp = /\/home$/,
) {
  await assignIsolatedTestClientIp(page);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(expectedUrl, { timeout: 20_000 });
}

test("owner can invite a new member from business settings", async ({ page }) => {
  test.setTimeout(120_000);
  const inviteEmail = `invite-${Date.now()}@example.com`;

  await signIn(page, demoOwnerEmail, demoOwnerPassword);
  const membersPath = `/${demoBusinessSlug}/settings/members`;
  try {
    await page.goto(membersPath, { waitUntil: "commit", timeout: 60_000 });
  } catch (error) {
    // The proxy can detach the document as the dynamic route commits in dev.
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) {
      throw error;
    }
  }
  await expect(page).toHaveURL(new RegExp(`${membersPath}$`), {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: "Manage Members" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Invite", exact: true }).first().click();
  await page.getByLabel("Email address").fill(inviteEmail);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Invite", exact: true })
    .click();

  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  const pendingButton = page.getByRole("button", { name: /pending/ });
  await expect(pendingButton).toBeVisible({ timeout: 20_000 });
  await pendingButton.click();

  await expect(page.getByText(inviteEmail, { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("button", { name: "Copy link" }).first(),
  ).toBeVisible();
});

test("invited user can sign in from the invite and accept access", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto(`/invite/${demoPendingInviteToken}`);
  await page.waitForLoadState("networkidle");

  await expect(
    page
      .locator("#app-root-content")
      .getByText("Join BrightSide Print Studio", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email address").fill(demoPendingInviteEmail);
  await page.locator("#password").fill(demoPendingInvitePassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(new RegExp(`/invite/${demoPendingInviteToken}$`), {
    timeout: 20_000,
  });
  // Let the invite route finish loading its client chunks; submitting the
  // server action against a still-compiling route is rejected in dev.
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Accept invite" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/home$`),
    { timeout: 20_000 },
  );
  // The accepted member's first dashboard render can trail the URL change
  // while the dev server compiles the shell, and the onboarding tour can open
  // over the queue (its modal hides the page from the accessibility tree).
  // Treat either as readiness, dismiss the tour, then check the content.
  const priorityQueue = page.getByRole("heading", { name: "Priority queue" });
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await expect(priorityQueue.or(skipTour)).toBeVisible({ timeout: 120_000 });
  if (await skipTour.isVisible()) {
    await skipTour.click();
  }
  await expect(priorityQueue).toBeVisible({ timeout: 60_000 });
});

test("manager can view members read-only in settings", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(page, demoManagerEmail, demoManagerPassword);

  await page.goto(`/${demoBusinessSlug}/quote-library`);
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/quote-library$`),
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole("heading", {
      name: "Quote library",
      level: 1,
    }),
  ).toBeVisible();

  await page.goto(`/${demoBusinessSlug}/settings/members`);
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/settings/members$`),
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole("heading", { name: "Manage Members" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Invite", exact: true }),
  ).toBeDisabled();
});

test("staff can access inquiry work but not forms or operational settings", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(page, demoStaffEmail, demoStaffPassword);

  await page.goto(`/${demoBusinessSlug}/inquiries`);
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/inquiries$`),
    { timeout: 20_000 },
  );
  await expect(page.getByRole("heading", { name: "Inquiries" })).toBeVisible();

  await page.goto(`/${demoBusinessSlug}/forms`);
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/home$`),
    { timeout: 20_000 },
  );

  await page.goto(`/${demoBusinessSlug}/quote-library`);
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/home$`),
    { timeout: 20_000 },
  );

  await page.goto(`/${demoBusinessSlug}/settings/profile`);
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/settings/profile$`),
    { timeout: 20_000 },
  );
});

test("non-members cannot open another business dashboard @smoke", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(
    page,
    demoOutsiderEmail,
    demoOutsiderPassword,
    /\/onboarding$|\/home$|\/login$/,
  );

  await page.goto(`/${demoBusinessSlug}/home`);
  await expect(page).not.toHaveURL(
    new RegExp(`/${demoBusinessSlug}/home$`),
    { timeout: 20_000 },
  );
});

test("owner can change a member role and remove them safely", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(page, demoOwnerEmail, demoOwnerPassword);
  await page.goto(`/${demoBusinessSlug}/settings/members`);
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: "Manage Members" }),
  ).toBeVisible();

  const ownerRow = page
    .getByRole("listitem")
    .filter({ hasText: demoOwnerEmail });
  await expect(
    ownerRow.getByText("Owner", { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  const staffRow = page
    .getByRole("listitem")
    .filter({ hasText: demoStaffEmail });

  await expect(staffRow).toBeVisible();

  await staffRow
    .getByRole("button", { name: "Manage access" })
    .filter({ visible: true })
    .click();
  await page.getByRole("radio", { name: "Manager" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(staffRow).toContainText("Manager", {
    timeout: 20_000,
  });

  await staffRow
    .getByRole("button", { name: /Open actions/ })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Remove member?" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText(demoStaffEmail, { exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });
});
