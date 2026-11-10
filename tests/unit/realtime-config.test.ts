import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadRealtimeEnv(overrides: Record<string, string>) {
  vi.resetModules();

  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }

  return import("@/lib/env");
}

describe("Supabase Realtime configuration", () => {
  it("accepts a browser-safe key without requiring the service-role key", async () => {
    const { isSupabaseRealtimeConfigured } = await loadRealtimeEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-safe-anon-key",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      REQUO_REALTIME_DRIVER: "supabase",
      SUPABASE_JWT_SECRET: "jwt-secret",
      SUPABASE_SERVICE_ROLE_KEY: "",
    });

    expect(isSupabaseRealtimeConfigured).toBe(true);
  });

  it("accepts a publishable key in place of the anon key", async () => {
    const { isSupabaseRealtimeConfigured } = await loadRealtimeEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_key",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      REQUO_REALTIME_DRIVER: "supabase",
      SUPABASE_JWT_SECRET: "jwt-secret",
      SUPABASE_SERVICE_ROLE_KEY: "",
    });

    expect(isSupabaseRealtimeConfigured).toBe(true);
  });

  it("stays disabled without a browser-safe key or when the driver is none", async () => {
    const missingKey = await loadRealtimeEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      REQUO_REALTIME_DRIVER: "supabase",
      SUPABASE_JWT_SECRET: "jwt-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });
    expect(missingKey.isSupabaseRealtimeConfigured).toBe(false);

    const disabled = await loadRealtimeEnv({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-safe-anon-key",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      REQUO_REALTIME_DRIVER: "none",
      SUPABASE_JWT_SECRET: "jwt-secret",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });
    expect(disabled.isSupabaseRealtimeConfigured).toBe(false);
  });
});
