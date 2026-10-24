import { expect, test, type Page } from "@playwright/test";

import { demoBusinessSlug } from "./fixtures";
import { registerSmokeGuard } from "./smoke-registry";

registerSmokeGuard();

const DEMO_BUSINESS_NAME = "BrightSide Print Studio";
const SESSION_STORAGE_KEY = `requo-agent-session:${demoBusinessSlug}`;

const MOCK_REPLY =
  "Thanks for reaching out! We handle storefront signage and event graphics — could you share a few details about the project?";

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
 * Mocks POST /api/ai/agent/chat with a deterministic UI message stream reply
 * so the smoke test never depends on a live LLM provider (AI keys are
 * disabled in the Playwright web server environment). Also asserts the
 * client sends a session token and UI messages.
 */
function mockAgentChatEndpoint(page: Page) {
  return page.route("**/api/ai/agent/chat", async (route) => {
    const request = route.request();

    expect(request.method()).toBe("POST");

    const body = request.postDataJSON() as {
      sessionToken?: unknown;
      messages?: Array<{ role?: string }>;
    };
    expect(body.sessionToken).toBeTruthy();
    expect(Array.isArray(body.messages)).toBe(true);

    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: uiStreamBody(MOCK_REPLY),
    });
  });
}

test("public chat flow streams a reply on the enabled demo business @smoke", async ({
  page,
}) => {
  await mockAgentChatEndpoint(page);

  await page.goto(`/b/${demoBusinessSlug}/chat`);
  await page.waitForLoadState("networkidle");

  // Slim header: the business's own name, and the centred greeting beneath it.
  await expect(page.getByRole("banner")).toContainText(DEMO_BUSINESS_NAME);
  await expect(page.getByText("How can we help?")).toBeVisible();

  const input = page.getByLabel(`Message ${DEMO_BUSINESS_NAME}`);
  // The session is minted by the first send, so the composer is usable on the
  // first paint and a visitor who never types leaves nothing behind.
  await expect(input).toBeEnabled();
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), SESSION_STORAGE_KEY),
  ).toBeNull();

  await input.fill("Hi, I need storefront signage.");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Hi, I need storefront signage.")).toBeVisible();
  await expect(page.getByText(MOCK_REPLY)).toBeVisible({ timeout: 10_000 });

  // A session token is persisted so a reload resumes the conversation.
  const storedToken = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    SESSION_STORAGE_KEY,
  );
  expect(storedToken).toMatch(/^[0-9a-f]{64}$/);

  // The transcript owns the scroll; the page itself does not.
  await expect(page.locator(".chat-stage-transcript")).toHaveCSS(
    "overflow-y",
    "auto",
  );

  // The composer stays pinned in the viewport — it never drifts down the page.
  const composerBox = await input.boundingBox();
  const viewport = page.viewportSize();
  expect(composerBox).not.toBeNull();
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(
    (viewport?.height ?? 800) + 1,
  );

  // Detached affordance is hidden while attached to the bottom.
  await expect(
    page.getByRole("button", { name: "Jump to latest" }),
  ).toBeHidden();
});

test("chat page shows the public not-found state for agent-disabled businesses", async ({
  page,
}) => {
  // "demo-business" (Santos Print Shop) is not seeded with the Agent.
  await page.goto("/b/demo-business/chat");

  await expect(page.getByText("This public page is unavailable.")).toBeVisible();
});

test("chat API rejects payloads without a session token", async ({ request }) => {
  const response = await request.post("/api/ai/agent/chat", {
    data: { content: "no token here" },
  });

  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "Invalid request. Session token and message content are required.",
  });
});
