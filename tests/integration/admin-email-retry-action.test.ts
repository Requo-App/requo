import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "requo-integration-test",
    }),
}));

vi.mock("@/features/admin/access", () => ({
  requireAdminUser: vi.fn(),
}));

vi.mock("@/features/admin/confirm", () => ({
  consumePasswordConfirmToken: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendEmailWithFallback: vi.fn(),
}));

import { requireAdminUser, type AdminContext } from "@/features/admin/access";
import { consumePasswordConfirmToken } from "@/features/admin/confirm";
import { retryEmailAction } from "@/features/admin/mutations";
import { sendEmailWithFallback } from "@/lib/email";
import { EmailSendError } from "@/lib/email/errors";
import { adminAuditLogs, emailOutbox, user } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";

const prefix = "test_email_retry_action";
const adminUserId = `${prefix}_admin`;
const validToken = "confirm-token-1234567890";

const adminUser = {
  id: adminUserId,
  name: "Retry Admin",
  email: `${adminUserId}@example.com`,
};

const adminContext = {
  user: adminUser,
  session: {
    user: adminUser,
    session: { impersonatedBy: null },
  },
} as unknown as AdminContext;

async function cleanup() {
  await testDb
    .delete(adminAuditLogs)
    .where(like(adminAuditLogs.targetId, `${prefix}%`));
  await testDb.delete(emailOutbox).where(like(emailOutbox.id, `${prefix}%`));
  await testDb.delete(user).where(eq(user.id, adminUserId));
}

async function createEmail(
  suffix: string,
  overrides: Partial<typeof emailOutbox.$inferInsert> = {},
) {
  const id = `${prefix}_${suffix}`;

  await testDb.insert(emailOutbox).values({
    id,
    type: "notification",
    to: ["owner@example.com"],
    from: "Requo <hello@example.com>",
    subject: "New inquiry",
    html: "<p>Hello</p>",
    textBody: "Hello",
    status: "failed",
    idempotencyKey: `retry:${suffix}`,
    metadata: { inquiryId: "inquiry-1" },
    ...overrides,
  });

  return id;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await cleanup();
  await testDb.insert(user).values({
    id: adminUserId,
    name: adminUser.name,
    email: adminUser.email,
    emailVerified: true,
    role: "admin",
  });

  vi.mocked(requireAdminUser).mockResolvedValue(adminContext);
  vi.mocked(consumePasswordConfirmToken).mockResolvedValue({ ok: true });
});

afterAll(async () => {
  await cleanup();
  await closeTestDb();
}, 30_000);

describe("retryEmailAction", () => {
  it("refuses a non-admin before touching the email", async () => {
    vi.mocked(requireAdminUser).mockRejectedValueOnce(
      new Error("Admin access required."),
    );

    await expect(
      retryEmailAction({ emailId: `${prefix}_none`, confirmToken: validToken }),
    ).rejects.toThrow("Admin access required.");
    expect(sendEmailWithFallback).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong confirmation token", async () => {
    const emailId = await createEmail("confirm");

    const missing = await retryEmailAction({
      emailId,
      confirmToken: "short",
    });
    expect(missing).toMatchObject({
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
    });

    vi.mocked(consumePasswordConfirmToken).mockResolvedValueOnce({
      ok: false,
      reason: "expired",
    });
    const wrong = await retryEmailAction({
      emailId,
      confirmToken: validToken,
    });
    expect(wrong).toMatchObject({
      ok: false,
      error: "Confirm your password to continue.",
    });

    expect(sendEmailWithFallback).not.toHaveBeenCalled();

    const failedConfirmation = await testDb
      .select({
        action: adminAuditLogs.action,
        targetId: adminAuditLogs.targetId,
        metadata: adminAuditLogs.metadata,
      })
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.targetId, emailId));

    expect(failedConfirmation).toContainEqual(
      expect.objectContaining({
        action: "confirmation.failed",
        metadata: expect.objectContaining({ reason: "expired" }),
      }),
    );
  });

  it("refuses sent, in-flight, unknown, and auth rows without sending", async () => {
    const rows = [
      {
        suffix: "sent",
        overrides: { status: "sent" as const },
        message: /already sent/i,
      },
      {
        suffix: "sending",
        overrides: { status: "sending" as const },
        message: /already in progress/i,
      },
      {
        suffix: "unknown",
        overrides: { status: "unknown" as const },
        message: /provider logs/i,
      },
      {
        suffix: "auth",
        overrides: { type: "auth" as const },
        message: /cannot be replayed/i,
      },
    ];

    for (const row of rows) {
      const emailId = await createEmail(row.suffix, row.overrides);
      const result = await retryEmailAction({
        emailId,
        confirmToken: validToken,
      });

      expect(result).toMatchObject({ ok: false });
      expect(!result.ok && result.error).toMatch(row.message);
    }

    expect(sendEmailWithFallback).not.toHaveBeenCalled();
  });

  it("replays a failed row with its original idempotency key and audits success", async () => {
    const emailId = await createEmail("success");
    vi.mocked(sendEmailWithFallback).mockResolvedValue({
      provider: "resend",
      providerMessageId: "msg_1",
      status: "sent",
    });

    const result = await retryEmailAction({
      emailId,
      confirmToken: validToken,
    });

    expect(result).toMatchObject({
      ok: true,
      message: "Email retry accepted by resend.",
    });
    expect(sendEmailWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "retry:success",
        to: ["owner@example.com"],
        subject: "New inquiry",
      }),
    );

    const [audit] = await testDb
      .select({
        action: adminAuditLogs.action,
        metadata: adminAuditLogs.metadata,
      })
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.targetId, emailId));

    expect(audit).toMatchObject({
      action: "email.retry",
      metadata: {
        outcome: "sent",
        emailType: "notification",
        subject: "New inquiry",
        provider: "resend",
      },
    });
  });

  it("surfaces a replay failure and audits the failed attempt", async () => {
    const emailId = await createEmail("failure");
    vi.mocked(sendEmailWithFallback).mockRejectedValue(
      new EmailSendError("Provider still down.", "provider_error"),
    );

    const result = await retryEmailAction({
      emailId,
      confirmToken: validToken,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Provider still down.",
    });

    const [audit] = await testDb
      .select({
        action: adminAuditLogs.action,
        metadata: adminAuditLogs.metadata,
      })
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.targetId, emailId));

    expect(audit).toMatchObject({
      action: "email.retry",
      metadata: {
        outcome: "failed",
        emailType: "notification",
        subject: "New inquiry",
        errorCode: "provider_error",
      },
    });
  });
});
