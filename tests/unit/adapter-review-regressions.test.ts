import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
  ["587", "", "", true],
  ["465", "", "", false],
  ["587", "true", "", false],
  ["587", "", "true", false],
])("requires STARTTLS according to transport settings %s/%s/%s", async (port, secure, optOut, requireTLS) => {
  vi.stubEnv("SMTP_HOST", "localhost");
  vi.stubEnv("SMTP_PORT", port);
  vi.stubEnv("SMTP_USER", "test");
  vi.stubEnv("SMTP_PASSWORD", "test");
  vi.stubEnv("SMTP_SECURE", secure);
  vi.stubEnv("SMTP_ALLOW_INSECURE_AUTH", optOut);
  const { smtpEmailProvider } = await import("@/lib/email/providers/smtp");
  await smtpEmailProvider.send({ from: "test@example.com", to: ["test@example.com"], emailType: "system", metadata: {}, subject: "test", html: "test", idempotencyKey: "test" });
  expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS }));
  expect(mocks.createTransport.mock.calls[0][0]).not.toHaveProperty("tls.rejectUnauthorized", false);
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
