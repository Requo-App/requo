import { expect, test, type Page } from "@playwright/test";

import {
  assignIsolatedTestClientIp,
  demoBusinessSlug,
  demoOwnerEmail,
  demoOwnerPassword,
} from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

const MOCK_REPLY =
  "You have 3 open inquiries, all waiting on a first response.";

/** Stands in for the session the route handler would mint on the first send. */
const MOCK_SESSION_ID = "oas_e2e_mock";

function uiStreamBody(text: string) {
  return [
    `data: {"type":"start","messageId":"msg-1"}`,
    ``,
    `data: {"type":"text-start","id":"text-1"}`,
    ``,
    `data: {"type":"text-delta","id":"text-1","delta":${JSON.stringify(text)}}`,
    ``,
    `data: {"type":"text-end","id":"text-1"}`,
    ``,
    `data: {"type":"finish"}`,
    ``,
    `data: [DONE]`,
    ``,
  ].join("\n");
}

/**
 * Mocks POST /api/ai/assistant/chat with a deterministic UI message
 * stream reply so the smoke test never depends on a live LLM provider.
 */
function mockAssistantChatEndpoint(page: Page) {
  return page.route("**/api/ai/assistant/chat", async (route) => {
    const request = route.request();

    expect(request.method()).toBe("POST");

    const body = request.postDataJSON() as {
      businessSlug?: unknown;
      sessionId?: unknown;
      messages?: unknown;
    };
    expect(body.businessSlug).toBe(demoBusinessSlug);
    // The server mints the session, so the opening send carries no id; every
    // request after it echoes the one returned in `X-Session-Id`.
    if (body.sessionId !== undefined) {
      expect(body.sessionId).toBe(MOCK_SESSION_ID);
    }
    expect(Array.isArray(body.messages)).toBe(true);

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        // The client reads the minted session from this header and rewrites the
        // URL in place, so the mock has to supply one.
        "X-Session-Id": MOCK_SESSION_ID,
      },
      body: uiStreamBody(MOCK_REPLY),
    });
  });
}

async function signIn(page: Page) {
  await assignIsolatedTestClientIp(page);
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();

  await page.getByLabel("Email address").fill(demoOwnerEmail);
  await page.locator("#password").fill(demoOwnerPassword);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 });
}

test("dashboard home chat box redirects to a session and streams a reply @smoke", async ({
  page,
}) => {
  // The warm-up navigations below compile three route trees in dev.
  test.setTimeout(240_000);

  await signIn(page);

  // Compile these dynamic dashboard pages before the assertions exercise the
  // client navigation path. A cold Next dev compile can otherwise leave a
  // clicked Link pending long enough to test the dev server instead of chat.
  await page.goto(`/${demoBusinessSlug}/assistant`);
  await page.goto(`/${demoBusinessSlug}/inquiries`);
  await page.goto(`/${demoBusinessSlug}/home`);

  await mockAssistantChatEndpoint(page);

  // No `networkidle` wait: dashboard routes prefetch their siblings, so the
  // network never idles. The web-first assertions below do the waiting.
  await page.goto(`/${demoBusinessSlug}/home`);

  const input = page.getByPlaceholder("Ask anything about your business");
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill("How many open inquiries do I have?");
  await page.getByRole("button", { name: "Send message" }).click();

  // The minted session lands in `?session=` on the Assistant route itself —
  // never a path change, which would swap the page segment mid-stream. The
  // first send also waits for the assistant route's dev compile.
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/assistant[?]session=oas_`),
    { timeout: 60_000 },
  );

  await expect(
    page.getByText("How many open inquiries do I have?"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(MOCK_REPLY)).toBeVisible({ timeout: 10_000 });

  // Leaving for another dashboard page and coming back through the sidebar
  // reopens the same conversation: the transcript lives outside the route.
  await page.getByRole("link", { name: /^Inquiries/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${demoBusinessSlug}/inquiries`), {
    timeout: 20_000,
  });
  await page.getByRole("link", { name: /^Assistant$/ }).click();

  await expect(
    page.getByText("How many open inquiries do I have?"),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(MOCK_REPLY)).toBeVisible({ timeout: 10_000 });
  // Back on the conversation's own URL, without a fresh session being minted.
  await expect(page).toHaveURL(
    new RegExp(`/${demoBusinessSlug}/assistant[?]session=${MOCK_SESSION_ID}$`),
    { timeout: 60_000 },
  );

  // The hand-off clears the dashboard box, so returning finds an empty prompt.
  await page.goto(`/${demoBusinessSlug}/home`);
  await expect(
    page.getByPlaceholder("Ask anything about your business"),
  ).toHaveValue("", { timeout: 20_000 });
});

test("assistant section root offers a fresh composer without creating history @smoke", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await signIn(page);

  // See above: dashboard prefetching keeps `networkidle` from settling.
  await page.goto(`/${demoBusinessSlug}/assistant`);

  // Centred greeting and composer, with history reachable from the header.
  // Cache Components keeps hidden route copies in the DOM; text locators do
  // not filter by visibility (role and placeholder locators do), so the text
  // assertion names the visible copy explicitly.
  await expect(
    page
      .getByText("How can I help with your business?")
      .filter({ visible: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByPlaceholder("Ask about inquiries, quotes, or customers"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open conversation history" }),
  ).toBeVisible();
  // Nothing to start over from until the first message is sent.
  await expect(page.getByRole("button", { name: "New chat" })).toBeDisabled();

  // The assistant pane scrolls its own transcript; the dashboard page does not.
  await expect(
    page
      .locator("[data-assistant-pane]")
      .filter({ visible: true })
      .locator(".chat-stage-transcript"),
  ).toHaveCSS("overflow-y", "auto");
});
