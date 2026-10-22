import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/chat-attachments", () => ({
  ChatAttachmentError: class ChatAttachmentError extends Error {},
}));

vi.mock("@/lib/ai/chat-request", () => ({
  decodeRequestAttachments: vi.fn(),
}));

import { mapChatError } from "@/lib/ai/chat-route-errors";
import {
  NO_CAPACITY_MESSAGE,
  NO_ELIGIBLE_MODEL_MESSAGE,
  NO_PROVIDER_MESSAGE,
} from "@/lib/ai/routing-errors";

describe("mapChatError AI routing diagnostics", () => {
  it.each([
    NO_PROVIDER_MESSAGE,
    NO_CAPACITY_MESSAGE,
    NO_ELIGIBLE_MODEL_MESSAGE,
  ])("returns the routing diagnostic with a 503: %s", async (message) => {
    const response = mapChatError(new Error(message), "image");

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ error: message });
  });

  it("keeps the legacy no-model message generic", async () => {
    const response = mapChatError(
      new Error("No suitable AI model available"),
      "image",
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "AI service temporarily unavailable. Please try again in a moment.",
    });
  });
});
