import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWorkspaceBusinessActionContextMock, redirectMock } = vi.hoisted(
  () => ({
    getWorkspaceBusinessActionContextMock: vi.fn(),
    redirectMock: vi.fn(),
  }),
);

vi.mock("@/lib/db/business-access", () => ({
  getWorkspaceBusinessActionContext: getWorkspaceBusinessActionContextMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import { runRecordAction } from "@/lib/actions/run-record-action";

type Result = {
  changed: boolean;
  locked: boolean;
};

const context = {
  user: { id: "user_1" },
  businessContext: { business: { id: "biz_1" } },
};

function options(overrides: Record<string, unknown> = {}) {
  return {
    runMutation: vi.fn(async () => ({ changed: true, locked: false })),
    missingError: "That record could not be found.",
    lockedError: (result: Result) =>
      result.locked ? "Unlock it first." : null,
    isSuccessful: (result: Result) => result.changed,
    invalidate: vi.fn(),
    messages: {
      success: "Done.",
      unchanged: "Already done.",
      fallbackError: "Failed to do it.",
      genericError: "We couldn't do that right now.",
    },
    ...overrides,
  };
}

describe("runRecordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    getWorkspaceBusinessActionContextMock.mockResolvedValue({
      ok: true,
      ...context,
    });
  });

  it("delegates to the mutation with business context and returns success", async () => {
    const opts = options();
    const result = await runRecordAction(opts);

    expect(opts.runMutation).toHaveBeenCalledWith({
      businessId: "biz_1",
      actorUserId: "user_1",
    });
    expect(opts.invalidate).toHaveBeenCalledWith(
      { changed: true, locked: false },
      "biz_1",
    );
    expect(result).toEqual({ success: "Done." });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the unchanged message without redirecting when nothing changed", async () => {
    const opts = options({
      runMutation: vi.fn(async () => ({ changed: false, locked: false })),
      messages: {
        success: "Done.",
        unchanged: "Already done.",
        fallbackError: "Failed to do it.",
        genericError: "We couldn't do that right now.",
        redirectHref: "/back",
      },
    });
    const result = await runRecordAction(opts);

    expect(result).toEqual({ success: "Already done." });
    expect(opts.invalidate).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns the missing error without invalidating when the record is gone", async () => {
    const opts = options({ runMutation: vi.fn(async () => null) });
    const result = await runRecordAction(opts);

    expect(result).toEqual({ error: "That record could not be found." });
    expect(opts.invalidate).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("invalidates before reporting a locked record", async () => {
    const opts = options({
      runMutation: vi.fn(async () => ({ changed: false, locked: true })),
    });
    const result = await runRecordAction(opts);

    expect(opts.invalidate).toHaveBeenCalled();
    expect(result).toEqual({ error: "Unlock it first." });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("passes through context failures without running the mutation", async () => {
    getWorkspaceBusinessActionContextMock.mockResolvedValue({
      ok: false,
      error: "Sign in first.",
    });
    const opts = options();
    const result = await runRecordAction(opts);

    expect(result).toEqual({ error: "Sign in first." });
    expect(opts.runMutation).not.toHaveBeenCalled();
    expect(opts.invalidate).not.toHaveBeenCalled();
  });

  it("converts mutation failures to the generic error", async () => {
    const failure = new Error("db down");
    const opts = options({
      runMutation: vi.fn(async () => {
        throw failure;
      }),
    });
    const result = await runRecordAction(opts);

    expect(result).toEqual({ error: "We couldn't do that right now." });
    expect(console.error).toHaveBeenCalledWith("Failed to do it.", failure);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects after a successful mutation when a target is configured", async () => {
    const opts = options({
      messages: {
        success: "Done.",
        unchanged: "Already done.",
        fallbackError: "Failed to do it.",
        genericError: "We couldn't do that right now.",
        redirectHref: "/back",
      },
    });
    const result = await runRecordAction(opts);

    expect(redirectMock).toHaveBeenCalledWith("/back");
    expect(result).toEqual({ success: "Done." });
  });

  it("rethrows redirect errors instead of swallowing them", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;push;/back;307;",
    });
    const opts = options({
      runMutation: vi.fn(async () => {
        throw redirectError;
      }),
    });

    await expect(runRecordAction(opts)).rejects.toBe(redirectError);
  });
});
