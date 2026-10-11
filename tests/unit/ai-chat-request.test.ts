import { describe, expect, it, vi } from "vitest";

import {
  ChatAttachmentError,
  decodeChatFilePart,
} from "@/lib/ai/chat-attachments";

vi.mock("@/lib/ai/chat-attachments", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@/lib/ai/chat-attachments")>();
  return { ...mod, decodeChatFilePart: vi.fn(mod.decodeChatFilePart) };
});

import {
  decodeRequestAttachments,
  extractUiMessageText,
  uiMessageSchema,
} from "@/lib/ai/chat-request";

const textFile = {
  mediaType: "text/plain",
  filename: "notes.txt",
  dataUrl: `data:text/plain;base64,${Buffer.from("hello").toString("base64")}`,
};

describe("uiMessageSchema", () => {
  it("accepts user messages with content or parts", () => {
    expect(
      uiMessageSchema.safeParse({ role: "user", content: "hi" }).success,
    ).toBe(true);
    expect(
      uiMessageSchema.safeParse({
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      }).success,
    ).toBe(true);
  });

  it("accepts all Autumn roles with optional id", () => {
    for (const role of ["user", "assistant", "system", "tool"] as const) {
      const parsed = uiMessageSchema.safeParse({ id: "m1", role });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects unknown roles and non-string text", () => {
    expect(
      uiMessageSchema.safeParse({ role: "customer", content: "hi" }).success,
    ).toBe(false);
    expect(
      uiMessageSchema.safeParse({
        role: "user",
        parts: [{ type: "text", text: 42 }],
      }).success,
    ).toBe(false);
  });
});

describe("extractUiMessageText", () => {
  it("prefers content and joins multiple text parts", () => {
    expect(extractUiMessageText({ role: "user", content: "hi" })).toBe("hi");
    expect(
      extractUiMessageText({
        role: "user",
        parts: [
          { type: "text", text: "a" },
          { type: "image", text: "ignored" },
          { type: "text" },
          { type: "text", text: "b" },
        ],
      }),
    ).toBe("a\nb");
  });

  it("keeps blank content for the agent surface", () => {
    expect(extractUiMessageText({ role: "user", content: "" })).toBe("");
    expect(
      extractUiMessageText({ role: "user", content: "   " }),
    ).toBe("   ");
  });

  it("falls back to parts for the owner surface on blank content", () => {
    expect(
      extractUiMessageText(
        { role: "user", content: "", parts: [{ type: "text", text: "hi" }] },
        true,
      ),
    ).toBe("hi");
    expect(
      extractUiMessageText(
        { role: "user", content: "   ", parts: [{ type: "text", text: "hi" }] },
        true,
      ),
    ).toBe("hi");
    expect(
      extractUiMessageText({ role: "user", content: "hi" }, true),
    ).toBe("hi");
  });

  it("returns empty string when nothing textual is present", () => {
    expect(extractUiMessageText({ role: "user" })).toBe("");
    expect(extractUiMessageText({ role: "user" }, true)).toBe("");
  });
});

describe("decodeRequestAttachments", () => {
  it("returns no attachments for missing or empty input", () => {
    expect(decodeRequestAttachments(undefined, "nope")).toEqual([]);
    expect(decodeRequestAttachments([], "nope")).toEqual([]);
  });

  it("decodes data URLs to bytes with metadata", () => {
    const [attachment] = decodeRequestAttachments([textFile], "nope");

    expect(attachment.fileName).toBe("notes.txt");
    expect(attachment.mimeType).toBe("text/plain");
    expect(attachment.bytes.toString()).toBe("hello");
  });

  it("remaps image errors while keeping ChatAttachmentError identity", () => {
    vi.mocked(decodeChatFilePart).mockImplementationOnce(() => {
      throw new ChatAttachmentError("image", "IMAGE_NOT_SUPPORTED");
    });

    try {
      decodeRequestAttachments([textFile], "Custom image message.");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ChatAttachmentError);
      expect((error as ChatAttachmentError).code).toBe("image");
      expect((error as Error).message).toBe("Custom image message.");
    }
  });

  it("passes through non-image attachment errors unchanged", () => {
    try {
      decodeRequestAttachments(
        [{ mediaType: "text/plain", filename: "x.txt", dataUrl: "bogus" }],
        "Custom image message.",
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ChatAttachmentError);
      expect((error as ChatAttachmentError).code).toBe("unreadable");
    }
  });
});
