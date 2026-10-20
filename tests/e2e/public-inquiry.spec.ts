import { expect, test } from "@playwright/test";

import { demoBusinessSlug } from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

test("invalid public inquiry links show the public not-found state", async ({
  page,
}) => {
  await page.goto("/inquire/not-a-real-business");

  await expect(
    page.getByText("This public page is unavailable."),
  ).toBeVisible();
});

test("public inquiry page rejects unsupported attachments", async ({ page }) => {
  await page.goto(`/inquire/${demoBusinessSlug}`);
  await page.waitForLoadState("networkidle");

  await page.locator("#inquiry-customerName:visible").fill("Taylor Nguyen");
  await page
    .locator("#inquiry-customerEmail:visible")
    .fill(`taylor+invalid-file-${Date.now()}@example.com`);
  await page
    .locator("#inquiry-details:visible")
    .fill("Need storefront graphics and want to send a sample file.");
  await page.locator("#inquiry-attachment:visible").setInputFiles({
    name: "malware.exe",
    mimeType: "application/x-msdownload",
    buffer: Buffer.from("pretend-binary"),
  });

  // The file is uploaded straight to storage, so the type is refused
  // before the inquiry is ever sent.
  await expect(
    page.getByText("Upload a PDF, common document file, or image."),
  ).toBeVisible();

  // A rejected file blocks the send until it is removed or replaced.
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("public inquiry page accepts a new submission @smoke", async ({ page }) => {
  await page.goto(`/inquire/${demoBusinessSlug}`);
  await page.waitForLoadState("networkidle");

  await page.locator("#inquiry-customerName:visible").fill("Taylor Nguyen");
  await page
    .locator("#inquiry-customerEmail:visible")
    .fill(`taylor+${Date.now()}@example.com`);
  await page.locator("#inquiry-budgetText:visible").fill("1500");
  await page
    .locator("#inquiry-details:visible")
    .fill(
      "Need two front-window vinyl panels and a smaller door decal for a spring refresh.",
    );

  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByRole("heading", { name: "Inquiry received." }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/submitted=1/);
  await expect(
    page.getByRole("link", { name: "Submit another inquiry" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send" }),
  ).toHaveCount(0);
});
