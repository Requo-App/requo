import { expect, test, type Page } from "@playwright/test";

import {
  assignIsolatedTestClientIp,
  demoBusinessSlug,
  demoOwnerEmail,
  demoOwnerPassword,
} from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await assignIsolatedTestClientIp(page);
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email address").fill(demoOwnerEmail);
  await page.locator("#password").fill(demoOwnerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/home$`),
    { timeout: 20_000 },
  );
}

async function createManualInvoice(page: Page, invoiceTitle: string) {
  await page.goto(`/${demoBusinessSlug}/invoices/new`, {
    waitUntil: "domcontentloaded",
  });

  // The streamed skeleton renders the same "Create a new invoice" heading, so
  // wait for a form-only field instead. Dashboard routes prefetch their
  // siblings, so `networkidle` never settles here (see
  // assistant-conversation.spec.ts); prove hydration through the form itself.
  const lineItemDescription = page.getByLabel("Line item 1 description");
  await expect(lineItemDescription).toBeVisible({ timeout: 120_000 });

  // A fill that lands before hydration is discarded when React attaches, so
  // retry the first edit until the serialized line-item state reflects it.
  const itemsInput = page.locator('input[name="items"]');
  await expect(async () => {
    await lineItemDescription.fill("Smoke line item");
    await expect(itemsInput).toHaveValue(/"description":"Smoke line item"/, {
      timeout: 2_000,
    });
  }).toPass({ timeout: 90_000 });

  await page.getByLabel("Title").fill(invoiceTitle);
  await page.getByLabel("Customer name").fill("Smoke Customer");
  await page.getByLabel("Customer email").fill("smoke.customer@example.com");
  await page.getByLabel("Line item 1 quantity").fill("2");
  await page.getByLabel("Line item 1 unit price").fill("125.00");

  await page.getByRole("button", { name: "Create invoice" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/invoices/(?!new$)[^/]+$`),
    { timeout: 60_000 },
  );
  await expect(
    page.getByRole("heading", { name: invoiceTitle }),
  ).toBeVisible({ timeout: 60_000 });
}

test("owner can create a manual invoice @smoke", async ({ page }) => {
  test.setTimeout(180_000);
  const invoiceTitle = `Smoke invoice ${Date.now()}`;

  await signIn(page);
  await createManualInvoice(page, invoiceTitle);

  await expect(
    page.getByRole("cell", { name: "Smoke line item" }),
  ).toBeVisible();
  await expect(page.getByText("$250.00", { exact: true }).first()).toBeVisible();
});

test("owner can record a manual payment against an invoice @smoke", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const invoiceTitle = `Smoke payment invoice ${Date.now()}`;

  await signIn(page);
  await createManualInvoice(page, invoiceTitle);

  await page.getByRole("button", { name: "Send invoice" }).click();
  const sendDialog = page.getByRole("dialog", { name: /^Send invoice/ });
  await expect(sendDialog).toBeVisible();
  await sendDialog.getByRole("button", { name: "Mark as sent" }).click();
  await expect(sendDialog).toBeHidden({ timeout: 30_000 });

  const recordPaymentButton = page.getByRole("button", {
    name: "Record payment",
  });
  await expect(recordPaymentButton.first()).toBeEnabled({ timeout: 60_000 });
  await recordPaymentButton.first().click();

  const paymentDialog = page.getByRole("dialog", { name: "Record payment" });
  await expect(paymentDialog).toBeVisible();
  await paymentDialog.getByLabel("Amount").fill("100.00");
  await paymentDialog.getByRole("button", { name: "Record payment" }).click();

  await expect(paymentDialog).toBeHidden({ timeout: 30_000 });

  const paymentRow = page
    .getByRole("row")
    .filter({ hasText: "$100.00" });
  await expect(paymentRow).toContainText("Recorded");
  await expect(
    paymentRow.getByRole("link", { name: /^PAY-\d{4}-\d{4}$/ }),
  ).toBeVisible();
  await expect(page.getByText("$150.00", { exact: true })).toBeVisible();

  // The payment must survive a reload, not just the optimistic row.
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "$100.00" }),
  ).toContainText("Recorded");
});
