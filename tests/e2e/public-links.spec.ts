import { expect, test } from "@playwright/test";

/**
 * Public links must answer a real `404` before the response streams. Each of
 * these routes has a `loading.tsx`, so the existence gate lives in the
 * segment layout; a missing gate silently regresses to a streamed `200`.
 */
const DEAD_PUBLIC_LINKS = [
  "/quote/not-a-real-public-token",
  "/approvals/not-a-real-public-token",
  "/b/not-a-real-business/inquire",
  "/inquire/not-a-real-business",
  "/inquire/not-a-real-business/not-a-real-service",
  // Seeded business without the Agent feature: the chat layout gate.
  "/b/demo-business/chat",
] as const;

test("dead public links answer HTTP 404 with the public not-found state", async ({
  page,
}) => {
  for (const path of DEAD_PUBLIC_LINKS) {
    const response = await page.goto(path);

    expect(response?.status(), path).toBe(404);
    await expect(
      page.getByRole("heading", { name: "This page is no longer available" }),
    ).toBeVisible();
  }
});
