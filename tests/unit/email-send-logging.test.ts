import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const outboxRow = {
    id: "outbox-1",
    status: "sent",
    provider: "resend",
    providerMessageId: "msg-1",
  };

  return {
    outboxRow,
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    send: vi.fn(),
  };
});

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
    select: mocks.select,
  },
}));

import { emailOutbox } from "@/lib/db/schema";
import { sendEmailWithFallback } from "@/lib/email/send-email";

function logEntries(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(
    ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
  );
}

const input = {
  to: "customer@example.test",
  from: "Requo <notifications@requo.test>",
  subject: "Test email",
  html: "<p>Hello</p>",
  idempotencyKey: "test-idempotency-key",
  emailType: "notification" as const,
};

beforeEach(() => {
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.select.mockReset();
  mocks.send.mockReset();

  mocks.insert.mockImplementation((table: unknown) => {
    if (table === emailOutbox) {
      return {
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => [mocks.outboxRow],
          }),
        }),
      };
    }

    return { values: async () => undefined };
  });
  mocks.update.mockImplementation(() => ({
    set: () => ({ where: async () => undefined }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email send logging", () => {
  it("logs the outbox ID and idempotency key on every provider attempt", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.send.mockResolvedValue({
      provider: "resend",
      providerMessageId: "msg-1",
      status: "sent",
    });

    await sendEmailWithFallback(input, {
      providers: [
        {
          name: "resend",
          isConfigured: () => true,
          send: mocks.send,
        },
      ],
    });

    const entries = logEntries(info);
    const started = entries.find(
      (entry) => entry.event === "email.provider.attempt_started",
    );
    const accepted = entries.find(
      (entry) => entry.event === "email.provider.accepted",
    );

    expect(started).toMatchObject({
      emailOutboxId: "outbox-1",
      idempotencyKey: "test-idempotency-key",
    });
    expect(accepted).toMatchObject({
      emailOutboxId: "outbox-1",
      idempotencyKey: "test-idempotency-key",
      providerMessageId: "msg-1",
    });
  });

  it("logs the outbox ID when an idempotent send is skipped", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.insert.mockImplementation(() => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: async () => [],
        }),
      }),
    }));
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [mocks.outboxRow],
        }),
      }),
    }));

    const result = await sendEmailWithFallback(input, {
      providers: [],
    });

    expect(result).toMatchObject({
      provider: "resend",
      providerMessageId: "msg-1",
    });

    const skipped = logEntries(info).find(
      (entry) => entry.event === "email.send.skipped_sent",
    );

    expect(skipped).toMatchObject({
      emailOutboxId: "outbox-1",
      idempotencyKey: "test-idempotency-key",
    });
  });
});
