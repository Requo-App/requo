import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadSession: vi.fn(), freshSession: vi.fn(), advance: vi.fn(), updateState: vi.fn(),
  count: vi.fn(), addMessage: vi.fn(), history: vi.fn(), messageLimit: vi.fn(),
  sessionLimit: vi.fn(), uploadLimit: vi.fn(), sanitize: vi.fn(), attachments: vi.fn(),
  reserve: vi.fn(), release: vi.fn(), settle: vi.fn(), resolveModel: vi.fn(),
  log: vi.fn(), startRun: vi.fn(), failRun: vi.fn(), updateRun: vi.fn(), stream: vi.fn(),
}));
vi.mock("ai", () => ({ streamText: mocks.stream, stepCountIs: vi.fn() }));
vi.mock("@/lib/ai/chat-fallback", () => ({ resolveChatFallbackModel: mocks.resolveModel }));
vi.mock("@/features/ai-agent/tools", () => ({ agentTools: {} }));
vi.mock("@/features/ai-agent/session-service", () => ({
  loadSessionByToken: mocks.loadSession, loadSessionById: mocks.freshSession,
  advanceQualificationFromMessage: mocks.advance, updateSessionState: mocks.updateState,
  updateSessionMetadata: vi.fn(),
}));
vi.mock("@/features/ai-agent/message-service", () => ({
  countSessionMessages: mocks.count, addAgentMessage: mocks.addMessage,
  buildAiSdkMessages: mocks.history, hasAgentMessageWithClientId: vi.fn(),
}));
vi.mock("@/lib/ai/conversation-limits", () => ({
  checkAgentMessageLimit: mocks.messageLimit, checkAgentSessionLimit: mocks.sessionLimit,
  checkAgentFileUploadLimit: mocks.uploadLimit,
}));
vi.mock("@/lib/ai/input-sanitizer", () => ({ sanitizeAiInput: mocks.sanitize }));
vi.mock("@/lib/ai/chat-attachments", () => ({
  processChatAttachments: mocks.attachments, ChatAttachmentError: class extends Error {},
}));
vi.mock("@/lib/ai/usage-limiter", () => ({
  reserveUsage: mocks.reserve, releaseUsageReservation: mocks.release,
  settleUsageReservation: mocks.settle, computeUsageWeight: () => 1,
}));
vi.mock("@/features/ai-agent/telemetry", () => ({
  startAgentRun: mocks.startRun, failAgentRun: mocks.failRun, updateAgentRun: mocks.updateRun,
  computeEstimatedCostCents: () => 0,
}));
vi.mock("@/lib/ai/token-logger", () => ({ logAiInvocation: mocks.log }));
vi.mock("@/lib/ai/security-events", () => ({ logAiSecurityEvent: vi.fn() }));

import { runAgent } from "@/features/ai-agent/orchestrator";

beforeEach(() => {
  vi.resetAllMocks();
  const state = { collected: {}, missing: ["name"] };
  mocks.loadSession.mockResolvedValue({
    id: "session-1", state, metadata: {},
    business: { id: "business-1", aiAgentEnabled: true, plan: "pro", name: "Test", slug: "test" },
  });
  mocks.advance.mockReturnValue(state);
  mocks.count.mockResolvedValue(0);
  mocks.messageLimit.mockResolvedValue({ allowed: true });
  mocks.sessionLimit.mockResolvedValue({ allowed: true });
  mocks.uploadLimit.mockResolvedValue({ allowed: true });
  mocks.reserve.mockResolvedValue({ allowed: true, reservation: { id: "reservation-1" } });
  mocks.sanitize.mockResolvedValue({ status: "clean", output: "Hello" });
  mocks.history.mockResolvedValue([{ role: "user", content: "Hello" }]);
  mocks.resolveModel.mockResolvedValue({
    fallbackModel: {}, serving: { model: "test", provider: "groq", modelId: "groq:test" },
    attemptTrail: [], correctUsage: vi.fn(),
  });
  mocks.startRun.mockResolvedValue({ id: "run-1" });
  mocks.failRun.mockResolvedValue(undefined);
  mocks.updateRun.mockResolvedValue(undefined);
  mocks.log.mockResolvedValue(undefined);
  mocks.stream.mockReturnValue({ toUIMessageStreamResponse: () => new Response("stream") });
});

const turn = { sessionToken: "token", userMessage: "Hello" };

describe("Agent session admission", () => {
  it.each(["monthly", "daily"])("rejects an empty session at the %s cap before reserving usage", async (period) => {
    mocks.sessionLimit.mockResolvedValue({ allowed: false, message: `${period} cap` });
    await expect(runAgent(turn)).rejects.toThrow(`SESSION_LIMIT_EXCEEDED: ${period} cap`);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.addMessage).not.toHaveBeenCalled();
  });

  it("allows an existing session to continue when new sessions are capped", async () => {
    mocks.count.mockResolvedValue(2);
    mocks.sessionLimit.mockResolvedValue({ allowed: false, message: "cap" });
    await expect(runAgent(turn)).resolves.toBeInstanceOf(Response);
    expect(mocks.sessionLimit).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});

describe("Agent reservation cleanup", () => {
  it.each([
    ["message limit", () => mocks.messageLimit.mockRejectedValue(new Error("failed"))],
    ["sanitization", () => mocks.sanitize.mockRejectedValue(new Error("failed"))],
    ["message persistence", () => mocks.addMessage.mockRejectedValue(new Error("failed"))],
    ["session reload", () => mocks.freshSession.mockRejectedValue(new Error("failed"))],
    ["model resolution", () => mocks.resolveModel.mockRejectedValue(new Error("failed"))],
    ["telemetry creation", () => mocks.startRun.mockRejectedValue(new Error("failed"))],
    ["stream setup", () => mocks.stream.mockImplementation(() => { throw new Error("failed"); })],
  ])("releases exactly once after a failure in %s", async (_stage, setup) => {
    setup();
    await expect(runAgent(turn)).rejects.toThrow("failed");
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith({ id: "reservation-1" });
    expect(mocks.settle).not.toHaveBeenCalled();
    if (_stage !== "stream setup") expect(mocks.failRun).not.toHaveBeenCalled();
  });

  it.each([
    ["message cap", () => mocks.messageLimit.mockResolvedValue({ allowed: false, message: "cap" }), turn],
    ["empty input", () => {}, { ...turn, userMessage: " " }],
    ["rejected input", () => mocks.sanitize.mockResolvedValue({ status: "rejected" }), turn],
    ["upload cap", () => mocks.uploadLimit.mockResolvedValue({ allowed: false, message: "cap" }), { ...turn, attachments: [{ fileName: "file.txt", bytes: Buffer.from("file"), mimeType: "text/plain" }] }],
  ])("releases usage after %s validation fails", async (_stage, setup, input) => {
    setup();
    await expect(runAgent(input)).rejects.toThrow();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("preserves the setup error and releases usage if failure telemetry also fails", async () => {
    mocks.stream.mockImplementation(() => { throw new Error("setup failed"); });
    mocks.failRun.mockRejectedValue(new Error("telemetry failed"));
    await expect(runAgent(turn)).rejects.toThrow("setup failed");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("settles provider errors and aborts only once without releasing the reservation", async () => {
    await runAgent(turn);
    const callbacks = mocks.stream.mock.calls[0][0];
    await callbacks.onError({ error: new Error("provider failed") });
    await callbacks.onAbort();
    expect(mocks.settle).toHaveBeenCalledExactlyOnceWith({ id: "reservation-1" }, 1);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
