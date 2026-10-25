import { expect, test } from "@playwright/test";

import {
  demoExpiredQuotePublicToken,
  demoQuotePublicToken,
  demoVoidedQuotePublicToken,
} from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

test.describe.configure({ mode: "serial" });

test("public quote page caps customer messages at 1,200 characters", async ({
  page,
}) => {
  await page.goto(`/quote/${demoQuotePublicToken}`);
  await page.waitForLoadState("networkidle");

  const messageField = page.getByLabel("Message (optional)");
  await messageField.fill("a".repeat(1_201));

  await expect(messageField).toHaveValue("a".repeat(1_200));
});

test("customer can accept a sent quote from the public quote page @smoke", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.goto(`/quote/${demoQuotePublicToken}`);
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { level: 1, name: "Foundry Labs booth kit" }),
  ).toBeVisible();

  const acceptButton = page.getByRole("button", { name: "Accept & Sign" });
  const acceptedNotice = page.getByText("Quote accepted");

  // A CI retry reuses the seeded quote, so a previous attempt may already have
  // accepted it. Accept either state up front and verify the persisted result
  // below rather than timing out on the removed button.
  await expect(acceptButton.or(acceptedNotice)).toBeVisible();

  if (await acceptButton.isVisible()) {
    await page.getByLabel("Your name").fill("Maria Santos");
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Message (optional)")
      .fill("Looks good. Please move ahead and confirm the production timeline.");
    await acceptButton.click();
  }

  await expect(acceptedNotice).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("Accepted by Maria Santos. The business has been notified."),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText("Looks good. Please move ahead and confirm the production timeline."),
  ).toBeVisible({ timeout: 20_000 });
});

test("expired public quote links stay read-only", async ({ page }) => {
  await page.goto(`/quote/${demoExpiredQuotePublicToken}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Quote expired", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/This quote expired on .+ Contact the business if you'd still like to proceed\./),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept & Sign" })).toHaveCount(0);
});

test("voided public quote links stay readable but non-actionable", async ({
  page,
}) => {
  await page.goto(`/quote/${demoVoidedQuotePublicToken}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Quote voided")).toBeVisible();
  await expect(
    page.getByText("This quote was voided by the business and is no longer active."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept & Sign" })).toHaveCount(0);
});

test("invalid public quote links show the public not-found state", async ({
  page,
}) => {
  await page.goto("/quote/not-a-real-public-token");

  await expect(
    page.getByText("This public page is unavailable."),
  ).toBeVisible();
});
