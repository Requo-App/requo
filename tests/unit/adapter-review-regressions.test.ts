import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  headers: new Headers(),
  list: vi.fn(),
  put: vi.fn(),
  createTransport: vi.fn((_options: Record<string, unknown>) => ({ sendMail: vi.fn(async () => ({ messageId: "sent" })) })),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => ({ list: mocks.list }) } }),
}));
vi.mock("@/lib/storage", () => ({ getObjectStorage: () => ({ put: mocks.put }) }));
vi.mock("@/lib/storage/upload-token", () => ({ verifyStorageUploadToken: () => ({ bucket: "inquiry-attachments", path: "test", contentType: "text/plain", maxBytes: 5 }) }));
vi.mock("node:net", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:net")>(),
  default: { ...await importOriginal<typeof import("node:net")>(), connect: mocks.connect },
}));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  mocks.headers = new Headers();
});

describe("billing provider selection", () => {
  it.each(["cloud", "self-hosted"])("honors explicit drivers in %s", async (mode) => {
    vi.stubEnv("REQUO_DEPLOYMENT_MODE", mode);
    for (const driver of ["", "polar", "paymongo", "none"]) {
      vi.stubEnv("REQUO_BILLING_DRIVER", driver);
      vi.resetModules();
      const { isBillingProviderEnabled } = await import("@/lib/deployment");
      for (const provider of ["polar", "paymongo"] as const) {
        expect(isBillingProviderEnabled(provider)).toBe(driver ? driver === provider : mode === "cloud");
      }
    }
  });
});

it("does not trust fallback geo headers when a custom header is configured", async () => {
  vi.stubEnv("GEO_COUNTRY_HEADER", "x-trusted-country");
  mocks.headers = new Headers({ "cf-ipcountry": "PH", "x-vercel-ip-country": "PH" });
  const { detectVisitorCountry, detectDisplayCurrency } = await import("@/lib/billing/region");
  expect(await detectVisitorCountry()).toBeNull();
  expect(await detectDisplayCurrency()).toBe("USD");
  mocks.headers.set("x-trusted-country", "US");
  expect(await detectVisitorCountry()).toBe("US");
  vi.stubEnv("GEO_COUNTRY_HEADER", "");
  expect(await detectVisitorCountry()).toBe("PH");
});

it.each([undefined, "", "123456"])("rejects invalid upload size for %j", async (body) => {
  const { PUT } = await import("@/app/api/storage/upload/route");
  const response = await PUT(new Request("https://requo.test/api/storage/upload?token=test", { method: "PUT", body }));
  expect(response.status).toBe(body ? 413 : 400);
  expect(await response.json()).toEqual({ error: body ? "That file is too large." : "The upload body is empty." });
  expect(mocks.put).not.toHaveBeenCalled();
});

it.each([
  ["smtp.example.com", "587", "", "", false, true],
  ["smtp.example.com", "587", "", "", true, true],
  ["smtp.example.com", "587", "", "true", false, true],
  ["smtp.example.com", "587", "", "true", true, true],
  ["smtp.example.com", "587", "", "1", true, true],
  ["smtp.example.com", "465", "", "", false, false],
  ["smtp.example.com", "587", "true", "", false, false],
  ["localhost", "587", "", "", true, true],
  ["localhost", "465", "", "", true, false],
  ["localhost", "587", "true", "", true, false],
  ["localhost", "587", "", "true", true, false],
  ["127.0.0.1", "587", "", "1", false, false],
  ["::1", "587", "", "true", false, false],
  ["localhost.example.com", "587", "", "true", true, true],
])("requires STARTTLS for relay settings %s/%s/%s/%s/auth=%s", async (host, port, secure, optOut, authenticated, requireTLS) => {
  vi.stubEnv("SMTP_HOST", host);
  vi.stubEnv("SMTP_PORT", port);
  vi.stubEnv("SMTP_USER", authenticated ? "test" : "");
  vi.stubEnv("SMTP_PASSWORD", authenticated ? "test" : "");
  vi.stubEnv("SMTP_SECURE", secure);
  vi.stubEnv("SMTP_ALLOW_INSECURE_AUTH", optOut);
  const { smtpEmailProvider } = await import("@/lib/email/providers/smtp");
  await smtpEmailProvider.send({ from: "test@example.com", to: ["test@example.com"], emailType: "system", metadata: {}, subject: "test", html: "test", idempotencyKey: "test" });
  expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS }));
  expect(typeof mocks.createTransport.mock.calls[0][0].getSocket).toBe(!requireTLS && !secure && port !== "465" ? "function" : "undefined");
  expect(mocks.createTransport.mock.calls[0][0]).not.toHaveProperty("tls.rejectUnauthorized", false);
});

describe("SMTP cleartext peer verification", () => {
  it.each([
    ["127.0.0.1", true],
    ["127.0.0.2", true],
    ["::1", true],
    ["::ffff:127.0.0.1", true],
    ["::ffff:7f00:1", true],
    ["192.0.2.1", false],
    ["10.0.0.1", false],
    ["2001:db8::1", false],
    ["::ffff:192.0.2.1", false],
    [undefined, false],
  ])("checks the connected peer %s before SMTP starts", async (remoteAddress, allowed) => {
    vi.stubEnv("SMTP_HOST", "localhost");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURE", "");
    vi.stubEnv("SMTP_ALLOW_INSECURE_AUTH", "true");
    const socket = Object.assign(new EventEmitter(), {
      remoteAddress,
      setTimeout: vi.fn(),
      destroy: vi.fn((error: Error) => socket.emit("error", error)),
    });
    mocks.connect.mockReturnValue(socket);
    const { smtpEmailProvider } = await import("@/lib/email/providers/smtp");
    await smtpEmailProvider.send({ from: "test@example.com", to: ["test@example.com"], emailType: "system", metadata: {}, subject: "test", html: "test", idempotencyKey: "test" });
    const options = mocks.createTransport.mock.calls[0][0];
    const getSocket = options.getSocket as NonNullable<import("nodemailer/lib/smtp-transport").Options["getSocket"]>;
    const callback = vi.fn();
    getSocket({}, callback);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(socket.listenerCount("connect")).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    socket.emit("connect");
    expect(callback).toHaveBeenCalledTimes(1);
    if (allowed) {
      expect(callback).toHaveBeenCalledWith(null, { connection: socket });
      expect(socket.destroy).not.toHaveBeenCalled();
    } else {
      expect(socket.destroy).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ message: "Cleartext SMTP requires a loopback peer." }), {});
    }
  });
});

it("lists later pages and nested folders while preserving the result limit", async () => {
  const file = (name: string) => ({ id: name, name, metadata: {} });
  mocks.list.mockImplementation(async (folder, { offset }) => ({
    data: folder === "nested" ? [file("child")] : offset === 0
      ? Array.from({ length: 100 }, (_, index) => file(String(index)))
      : [{ id: null, name: "nested" }, file("last")],
    error: null,
  }));
  const { SupabaseObjectStorage } = await import("@/lib/storage/supabase");
  const storage = new SupabaseObjectStorage();
  const results = await storage.list({ bucket: "inquiry-attachments" });
  expect(results).toHaveLength(102);
  expect(results.map(({ path }) => path)).toContain("nested/child");
  expect((await storage.list({ bucket: "inquiry-attachments", limit: 101 }))).toHaveLength(101);
  mocks.list.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
  await expect(storage.list({ bucket: "inquiry-attachments" })).rejects.toThrow("Failed to list inquiry-attachments: unavailable");
});
