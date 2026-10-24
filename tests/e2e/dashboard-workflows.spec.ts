import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  assignIsolatedTestClientIp,
  demoOwnerEmail,
  demoOwnerPassword,
  demoBusinessSlug,
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

async function openBusinessesPage(page: Page, path: string) {
  await page.goto(`/${demoBusinessSlug}${path}`, {
    waitUntil: "domcontentloaded",
  });
}

function getPreviewOverlay(page: Page) {
  return page.getByTestId("inquiry-form-preview-overlay");
}

async function openPreview(page: Page) {
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(getPreviewOverlay(page)).toBeVisible();
}

async function closePreview(page: Page) {
  const overlay = getPreviewOverlay(page);
  await overlay.getByRole("button", { name: "Back to editor" }).click();
  await expect(overlay).toBeHidden();
}

async function expectDocumentOrder(
  page: Page,
  locators: Locator[],
  timeout = 5_000,
) {
  const handles = await Promise.all(
    locators.map(async (locator) => {
      await expect(locator).toBeVisible({ timeout });
      return locator.elementHandle();
    }),
  );

  for (const handle of handles) {
    expect(handle).not.toBeNull();
  }

  const isOrdered = await page.evaluate((elements) => {
    return elements.every((element, index) => {
      if (index === 0) {
        return true;
      }

      return Boolean(
        elements[index - 1].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  }, handles as NonNullable<(typeof handles)[number]>[]);

  expect(isOrdered).toBeTruthy();
}

async function moveProjectField(page: Page, label: string, item: "Move up" | "Move down") {
  // The trigger is labelled by its field, so the menu stays addressable when
  // the card gains controls or reorders.
  const menuTrigger = page.getByRole("button", {
    name: `${label} field actions`,
  });

  // Scroll the trigger into view first so the portaled menu opens inside the
  // viewport.
  await menuTrigger.scrollIntoViewIfNeeded();
  await menuTrigger.click();
  const menuItem = page.getByRole("menuitem", { name: item });
  await expect(menuItem).toBeVisible();
  await menuItem.click();
}

const supportingCardTitles = [
  "Share the essentials",
  "Add files if helpful",
  "Call out the timing",
] as const;

/** Reads the editor's card order from the sortable handle labels. */
async function getSupportingCardOrder(page: Page) {
  return page.evaluate((titles: readonly string[]) => {
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-label^="Reorder "]'),
      (element) => element.getAttribute("aria-label") ?? "",
    );

    return labels
      .map((label) => label.replace(/^Reorder /, ""))
      .filter((label) => titles.includes(label));
  }, [...supportingCardTitles]);
}

async function moveSupportingCard(
  page: Page,
  title: string,
  direction: "ArrowUp" | "ArrowDown",
  overId: string,
  expectedOrder: string[],
) {
  const handle = page.getByRole("button", { name: `Reorder ${title}` });
  // The tab keeps another DndContext mounted, so target the live region that
  // has announced a drag. Waiting for the over target proves the keyboard
  // sensor processed the key without fixed sleeps.
  const announcement = page
    .locator('[role="status"][aria-live="assertive"]')
    .filter({ hasText: /draggable item/i });

  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(announcement).toContainText(/draggable item/i);

  await page.keyboard.press(direction);
  await expect(announcement).toContainText(
    `moved over droppable area ${overId}`,
  );

  await page.keyboard.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await expect(announcement).toContainText("was dropped");
  await expect.poll(() => getSupportingCardOrder(page)).toEqual(expectedOrder);
}

test("dashboard and detail pages surface follow-up, expiring-soon, and customer history context", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);

  await openBusinessesPage(page, "/home");

  await expect(
    page.getByRole("heading", { name: "Priority queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Follow up on viewed quote/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Follow up due" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Follow up before expiry/ }).first(),
  ).toBeVisible();

  await openBusinessesPage(page, "/quotes/demo_quote_sent_1002");

  await expect(
    page.getByRole("button", {
      name: /Follow up on viewed quote.*no response/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Post-acceptance" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "View customer history" }).click();
  await expect(
    page.getByRole("link", { name: "Foundry Labs storefront rebrand" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Q-SMOKE-0998 · Foundry Labs rebrand signage package",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Q-SMOKE-1002/ }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  await openBusinessesPage(page, "/inquiries/demo_inquiry_quoted_booth_kit");

  await expect(
    page.getByRole("link", { name: /Q-SMOKE-1002/ }).first(),
  ).toHaveAttribute(
    "href",
    `/${demoBusinessSlug}/quotes/demo_quote_sent_1002`,
  );
  await expect(
    page.getByRole("button", { name: "View customer history" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View quotes (2)" }),
  ).toBeVisible();
});

test("owner can open the quote editor from an inquiry and create a linked draft quote @smoke", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page);

  // The dev server compiles the editor's client chunks on first visit, which
  // can take far longer than the client navigation this test verifies. Warm
  // the route first so the assertion below measures the journey, not Turbopack.
  await page.goto(
    `/${demoBusinessSlug}/quotes/new?inquiryId=demo_inquiry_quoted_booth_kit`,
  );
  await expect(
    page.getByRole("heading", { name: "Turn this inquiry into a quote" }),
  ).toBeVisible({ timeout: 120_000 });

  await openBusinessesPage(page, "/inquiries/demo_inquiry_quoted_booth_kit");

  await page.getByRole("button", { name: "View quotes (2)" }).click();
  await page.getByRole("menuitem", { name: "Create new quote" }).click();

  await expect(page).toHaveURL(
    new RegExp(
      `/${demoBusinessSlug}/quotes/new\\?inquiryId=demo_inquiry_quoted_booth_kit$`,
    ),
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole("heading", { name: "Turn this inquiry into a quote" }),
  ).toBeVisible();
  await expect(page.getByLabel("Quote title")).toHaveValue(/\S+/);
  await expect(page.getByLabel("Customer name")).toHaveValue("Taylor Nguyen");
  // The seeded inquiry's preferred contact channel is phone.
  await expect(page.getByLabel("Phone")).toHaveValue("+1 415 555 0199");

  await page.getByRole("button", { name: "Create draft quote" }).click();

  await expect(
    page,
  ).toHaveURL(new RegExp(`/${demoBusinessSlug}/quotes/.+$`), {
    timeout: 20_000,
  });
  await expect(page.getByLabel("Quote title")).toHaveValue(/\S+/);
});

test("inquiry form preview reflects unsaved field and page edits in realtime", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const updatedBudgetLabel = `Budget ${Date.now()}`;
  const updatedHeadline = `Custom request preview ${Date.now()}`;

  await signIn(page);
  await openBusinessesPage(page, "/services/project-request");
  await page.getByRole("tab", { name: "Form" }).click();

  // Contact-field labels are locked; project fields stay editable.
  const budgetLabelInput = page.getByLabel("Budget range label");
  const originalBudgetLabel = await budgetLabelInput.inputValue();

  await budgetLabelInput.fill(updatedBudgetLabel);

  await openPreview(page);
  const previewOverlay = getPreviewOverlay(page);

  await expect(previewOverlay.getByLabel(updatedBudgetLabel)).toBeVisible({
    timeout: 20_000,
  });

  await closePreview(page);
  await page.getByRole("tab", { name: "Service page" }).click();

  const headlineInput = page.locator("#service-page-headline");
  const originalHeadline = await headlineInput.inputValue();

  await headlineInput.fill(updatedHeadline);
  await openPreview(page);

  await expect(
    previewOverlay.getByRole("heading", { name: updatedHeadline, exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  await closePreview(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(headlineInput).toHaveValue(originalHeadline);

  await page.getByRole("tab", { name: "Form" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Budget range label")).toHaveValue(
    originalBudgetLabel,
  );
});

test("project fields can be reordered and the preview order persists after save", async ({
  page,
}) => {
  // The public preview route compiles on first visit in dev.
  test.setTimeout(240_000);

  await signIn(page);
  await openBusinessesPage(page, "/services/project-request");
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Form" }).click();

  // Swap Budget range with its neighbour. Pointer drags across the grid
  // depend on card geometry; the card menu does not. Read the current order
  // first because earlier runs may have persisted a different one.
  const orderBefore = await page
    .getByRole("button", { name: /^Reorder / })
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        (node.getAttribute("aria-label") ?? "").replace(/^Reorder /, ""),
      ),
    );
  const budgetIndex = orderBefore.indexOf("Budget range");
  expect(budgetIndex).toBeGreaterThanOrEqual(0);
  const moveUp = budgetIndex > 0;
  const neighbour = orderBefore[budgetIndex + (moveUp ? -1 : 1)];
  const expectedOrder = moveUp
    ? ["Budget range", neighbour]
    : [neighbour, "Budget range"];

  await moveProjectField(page, "Budget range", moveUp ? "Move up" : "Move down");

  await openPreview(page);
  const previewOverlay = getPreviewOverlay(page);

  // The move swapped Budget range with its neighbour. The preview fields
  // stream in after the dialog shell while the dev server compiles them.
  await expectDocumentOrder(
    page,
    expectedOrder.map((label) => previewOverlay.getByLabel(label)),
    60_000,
  );

  await closePreview(page);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Intake form saved.")).toBeVisible({
    timeout: 20_000,
  });

  const savedPreviewPage = await page.context().newPage();
  await savedPreviewPage.goto(
    `/${demoBusinessSlug}/preview/inquiry/project-request`,
    { waitUntil: "commit" },
  );

  await expectDocumentOrder(
    savedPreviewPage,
    expectedOrder.map((label) => savedPreviewPage.getByLabel(label)),
    60_000,
  );

  await savedPreviewPage.close();

  // Restore the order this run started from.
  await moveProjectField(
    page,
    "Budget range",
    moveUp ? "Move down" : "Move up",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Intake form saved.")).toBeVisible({
    timeout: 20_000,
  });
});

test("supporting card fields can be edited and previewed before save", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const updatedCardTitle = `Specs first ${Date.now()}`;
  const updatedCardDescription =
    "Share the size, quantity, and any install constraints before we review the request.";

  await signIn(page);
  await openBusinessesPage(page, "/services/project-request");
  await page.getByRole("tab", { name: "Service page" }).click();
  await page.getByRole("button", { name: /^Supporting cards/ }).click();

  const titleInput = page.locator("#inquiry-card-title-details");
  const descriptionInput = page.locator("#inquiry-card-description-details");

  await titleInput.fill(updatedCardTitle);
  await descriptionInput.fill(updatedCardDescription);

  await expect(titleInput).toHaveValue(updatedCardTitle);
  await expect(descriptionInput).toHaveValue(updatedCardDescription);

  await openPreview(page);
  const previewOverlay = getPreviewOverlay(page);

  await expect(
    previewOverlay.getByText(updatedCardTitle, { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    previewOverlay.getByText(updatedCardDescription, { exact: true }),
  ).toBeVisible();

  await closePreview(page);
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("supporting cards can be reordered and the preview order persists after save", async ({
  page,
}) => {
  // The public preview route compiles on first visit in dev.
  test.setTimeout(180_000);

  await signIn(page);
  await openBusinessesPage(page, "/services/project-request");
  await page.getByRole("tab", { name: "Service page" }).click();
  await page.getByRole("button", { name: /^Supporting cards/ }).click();

  // Pointer drags of these tall cards land on whichever card centre follows
  // the pointer, so reorder deterministically with dnd-kit's keyboard sensor.
  const initialOrder = [...supportingCardTitles];
  const reorderedCards = [
    "Call out the timing",
    "Share the essentials",
    "Add files if helpful",
  ];

  await expect.poll(() => getSupportingCardOrder(page)).toEqual(initialOrder);

  await moveSupportingCard(
    page,
    "Call out the timing",
    "ArrowUp",
    "upload",
    ["Share the essentials", "Call out the timing", "Add files if helpful"],
  );
  await moveSupportingCard(
    page,
    "Call out the timing",
    "ArrowUp",
    "details",
    reorderedCards,
  );

  await openPreview(page);
  const previewOverlay = getPreviewOverlay(page);

  await expectDocumentOrder(page, [
    previewOverlay.getByText("Call out the timing", { exact: true }),
    previewOverlay.getByText("Share the essentials", { exact: true }),
    previewOverlay.getByText("Add files if helpful", { exact: true }),
  ]);

  await closePreview(page);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Service page saved.")).toBeVisible({
    timeout: 20_000,
  });

  const savedPreviewPage = await page.context().newPage();
  await savedPreviewPage.goto(
    `/${demoBusinessSlug}/preview/inquiry/project-request`,
    { waitUntil: "commit" },
  );

  await expectDocumentOrder(savedPreviewPage, [
    savedPreviewPage.getByText("Call out the timing", { exact: true }),
    savedPreviewPage.getByText("Share the essentials", { exact: true }),
    savedPreviewPage.getByText("Add files if helpful", { exact: true }),
  ]);

  await savedPreviewPage.close();

  // Restore the order this run started from so a reused database is unchanged.
  await expect(page.getByText("Service page saved.")).toBeHidden({
    timeout: 20_000,
  });
  // The refresh after saving can remount the section in its collapsed state.
  const supportingCardsToggle = page.getByRole("button", {
    name: /^Supporting cards/,
  });
  if ((await supportingCardsToggle.getAttribute("aria-expanded")) !== "true") {
    await supportingCardsToggle.click();
  }
  await expect(
    page.getByRole("button", { name: "Reorder Call out the timing" }),
  ).toBeVisible();

  await moveSupportingCard(
    page,
    "Call out the timing",
    "ArrowDown",
    "details",
    ["Share the essentials", "Call out the timing", "Add files if helpful"],
  );
  await moveSupportingCard(
    page,
    "Call out the timing",
    "ArrowDown",
    "upload",
    initialOrder,
  );

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Service page saved.")).toBeVisible({
    timeout: 20_000,
  });
});

test("quotes and inquiries list exports honor filters and show export actions", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(page);

  await openBusinessesPage(page, "/quotes?status=sent&sort=newest");
  const quotesExport = page.getByRole("button", { name: "Export CSV" });
  await expect(quotesExport).toBeVisible();
  await expect(page.getByRole("link", { name: "Create quote" })).toBeVisible();

  await quotesExport.click();
  const quoteExportLink = page.getByRole("link", { name: "Download CSV" });
  await expect(quoteExportLink).toBeVisible();
  const quoteExportHref = await quoteExportLink.getAttribute("href");
  expect(quoteExportHref).toContain(
    `/api/business/${demoBusinessSlug}/quotes/export`,
  );
  expect(quoteExportHref).toContain("status=sent");
  // Newest-first is the export default, so the href omits the sort param.
  expect(quoteExportHref).not.toContain("page=");
  await page.keyboard.press("Escape");

  const quoteCsvResponse = await page.request.get(
    `/api/business/${demoBusinessSlug}/quotes/export?status=sent&sort=newest&page=2`,
  );
  expect(quoteCsvResponse.ok()).toBeTruthy();
  expect(quoteCsvResponse.headers()["content-type"]).toContain("text/csv");
  const quoteCsvText = await quoteCsvResponse.text();
  expect(quoteCsvText.startsWith("\uFEFF")).toBeTruthy();
  expect(quoteCsvText).toContain(
    "quote_number,title,customer_name,customer_email,status,archived_at,voided_at,linked_inquiry_id,valid_until,total_amount,currency,created_at,sent_at,customer_responded_at",
  );
  expect(quoteCsvText).toContain(",sent,");

  await openBusinessesPage(page, "/inquiries?status=waiting&form=all&sort=newest");
  const inquiryExport = page.getByRole("button", { name: "Export CSV" });
  await expect(inquiryExport).toBeVisible();

  await inquiryExport.click();
  const inquiryExportLink = page.getByRole("link", { name: "Download CSV" });
  await expect(inquiryExportLink).toBeVisible();
  const inquiryExportHref = await inquiryExportLink.getAttribute("href");
  expect(inquiryExportHref).toContain(
    `/api/business/${demoBusinessSlug}/inquiries/export`,
  );
  expect(inquiryExportHref).toContain("status=waiting");
  expect(inquiryExportHref).not.toContain("page=");
  await page.keyboard.press("Escape");

  const inquiryCsvResponse = await page.request.get(
    `/api/business/${demoBusinessSlug}/inquiries/export?status=waiting&form=all&sort=newest&page=2`,
  );
  expect(inquiryCsvResponse.ok()).toBeTruthy();
  expect(inquiryCsvResponse.headers()["content-type"]).toContain("text/csv");
  const inquiryCsvText = await inquiryCsvResponse.text();
  expect(inquiryCsvText.startsWith("\uFEFF")).toBeTruthy();
  expect(inquiryCsvText).toContain(
    "inquiry_id,submitted_at,form_name,customer_name,customer_email,contact_method,contact_handle,service,service_slug,source,source_label,subject,status,record_state,budget_text,requested_deadline,details,archived_at",
  );
  expect(inquiryCsvText).toContain(",waiting,");
});

test("inquiry detail exposes PDF export and print-safe document", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(page);
  await openBusinessesPage(page, "/inquiries/demo_inquiry_quoted_booth_kit");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("button", { name: "More actions" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View quotes (2)" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).first().click();
  await expect(
    page.getByRole("menuitem", { name: "Export PDF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Export PNG" }),
  ).toBeVisible();

  // The export route renders this print page in a headless browser. Visit it
  // first so the API request does not pay the dev server's cold compile.
  await page.goto(
    `/${demoBusinessSlug}/print/inquiries/demo_inquiry_quoted_booth_kit`,
  );
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", {
      name: "Inquiry demo_inquiry_quoted_booth_kit",
    }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByText("Inquiry summary", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal notes" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Activity log" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Status" })).toHaveCount(0);

  const pdfResponse = await page.request.get(
    `/api/business/${demoBusinessSlug}/inquiries/demo_inquiry_quoted_booth_kit/export`,
    { timeout: 120_000 },
  );
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  const pdfBuffer = await pdfResponse.body();
  expect(pdfBuffer.toString("utf-8", 0, 4)).toBe("%PDF");

  const pngResponse = await page.request.get(
    `/api/business/${demoBusinessSlug}/inquiries/demo_inquiry_quoted_booth_kit/export?format=png`,
    { timeout: 120_000 },
  );
  expect(pngResponse.ok()).toBeTruthy();
  expect(pngResponse.headers()["content-type"]).toContain("image/png");
  const pngBuffer = await pngResponse.body();
  expect(Array.from(pngBuffer.subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
});

test("quote detail exposes export formats and returns PDF and PNG downloads", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);
  await signIn(page);
  await openBusinessesPage(page, "/quotes/demo_quote_sent_1002");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "More actions" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).first().click();
  await expect(
    page.getByRole("menuitem", { name: "Export PDF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Export PNG" }),
  ).toBeVisible();

  // Warm the print route the export route screenshots before requesting it.
  await page.goto(
    `/${demoBusinessSlug}/print/quotes/demo_quote_sent_1002?autoprint=0`,
  );
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByRole("heading", { name: "Foundry Labs booth kit" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Prepared for")).toBeVisible();
  await expect(page.getByText("Quote details")).toBeVisible();

  const pdfResponse = await page.request.get(
    `/api/business/${demoBusinessSlug}/quotes/demo_quote_sent_1002/export`,
    { timeout: 120_000 },
  );
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  const pdfBuffer = await pdfResponse.body();
  expect(pdfBuffer.toString("utf-8", 0, 4)).toBe("%PDF");

  const pngResponse = await page.request.get(
    `/api/business/${demoBusinessSlug}/quotes/demo_quote_sent_1002/export?format=png`,
    { timeout: 120_000 },
  );
  expect(pngResponse.ok()).toBeTruthy();
  expect(pngResponse.headers()["content-type"]).toContain("image/png");
  const pngBuffer = await pngResponse.body();
  expect(Array.from(pngBuffer.subarray(0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
});

test("notification settings live on their own settings page and persist", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultNavigationTimeout(90_000);

  await signIn(page);

  await openBusinessesPage(page, "/settings/notifications");

  await expect(
    page.getByRole("heading", { name: "In-app notifications", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Push notifications", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "New inquiry received in-app" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Quote response in-app" }),
  ).toBeVisible();

  // General settings no longer host notification toggles.
  await openBusinessesPage(page, "/settings/general");
  await expect(
    page.getByRole("heading", { name: "In-app notifications" }),
  ).toHaveCount(0);

  await openBusinessesPage(page, "/settings/notifications");
  await page.waitForLoadState("networkidle");
  const inquirySwitch = page.getByRole("switch", {
    name: "New inquiry received in-app",
  });
  await expect(inquirySwitch).toBeVisible();

  const initialState = await inquirySwitch.getAttribute("data-state");
  expect(initialState).toMatch(/^(checked|unchecked)$/);
  const toggledState = initialState === "checked" ? "unchecked" : "checked";

  // A click before hydration is a no-op, so retry until the switch moves.
  async function setSwitchState(control: Locator, expected: string) {
    await expect(async () => {
      if ((await control.getAttribute("data-state")) !== expected) {
        await control.click();
      }
      await expect(control).toHaveAttribute("data-state", expected, {
        timeout: 10_000,
      });
    }).toPass({ timeout: 40_000 });
  }

  // Toggles auto-save; wait for the action before reloading to prove it
  // reached the server. Reloading mid-save would read the previous value.
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/settings/notifications"),
    { timeout: 30_000 },
  );
  await setSwitchState(inquirySwitch, toggledState);
  await saved;

  await page.reload({ waitUntil: "networkidle" });
  const reloadedSwitch = page.getByRole("switch", {
    name: "New inquiry received in-app",
  });
  await expect(reloadedSwitch).toHaveAttribute("data-state", toggledState);

  // Restore the seeded preference.
  await setSwitchState(reloadedSwitch, initialState!);
});
