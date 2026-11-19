import { describe, expect, it } from "vitest";

import {
  buildEmailRetryInput,
  getEmailRetryBlockReason,
  type RetryableEmailOutboxRow,
} from "@/features/admin/email-retry";

function row(
  overrides: Partial<RetryableEmailOutboxRow> = {},
): RetryableEmailOutboxRow {
  return {
    businessId: "biz_1",
    userId: "user_1",
    type: "notification",
    to: ["owner@example.com"],
    cc: null,
    bcc: null,
    from: "Requo <hello@requo.test>",
    subject: "New inquiry",
    html: "<p>Hello</p>",
    textBody: "Hello",
    status: "failed",
    idempotencyKey: "notification:inquiry_1",
    metadata: { inquiryId: "inquiry_1" },
    ...overrides,
  };
}

describe("getEmailRetryBlockReason", () => {
  it("allows a failed non-auth email", () => {
    expect(getEmailRetryBlockReason(row())).toBeNull();
    expect(getEmailRetryBlockReason(row({ status: "pending" }))).toBeNull();
  });

  it("refuses sent, in-flight, and unknown rows", () => {
    expect(getEmailRetryBlockReason(row({ status: "sent" }))).toMatch(
      /already sent/i,
    );
    expect(getEmailRetryBlockReason(row({ status: "sending" }))).toMatch(
      /already in progress/i,
    );
    expect(getEmailRetryBlockReason(row({ status: "unknown" }))).toMatch(
      /provider logs/i,
    );
  });

  it("refuses auth emails because their stored body is redacted", () => {
    expect(
      getEmailRetryBlockReason(row({ type: "auth" })),
    ).toMatch(/cannot be replayed/i);
    expect(
      getEmailRetryBlockReason(
        row({ html: "[redacted auth email body]" }),
      ),
    ).toMatch(/no stored body/i);
    expect(getEmailRetryBlockReason(row({ html: "  " }))).toMatch(
      /no stored body/i,
    );
  });
});

describe("buildEmailRetryInput", () => {
  it("reuses the outbox content and idempotency key", () => {
    expect(buildEmailRetryInput(row())).toEqual({
      to: ["owner@example.com"],
      cc: undefined,
      bcc: undefined,
      from: "Requo <hello@requo.test>",
      subject: "New inquiry",
      html: "<p>Hello</p>",
      text: "Hello",
      emailType: "notification",
      idempotencyKey: "notification:inquiry_1",
      businessId: "biz_1",
      userId: "user_1",
      metadata: { inquiryId: "inquiry_1" },
    });
  });

  it("preserves optional recipients and text", () => {
    expect(
      buildEmailRetryInput(
        row({
          cc: ["support@example.com"],
          bcc: ["audit@example.com"],
          textBody: null,
        }),
      ),
    ).toMatchObject({
      cc: ["support@example.com"],
      bcc: ["audit@example.com"],
      text: undefined,
    });
  });
});
