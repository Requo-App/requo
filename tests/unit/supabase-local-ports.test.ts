import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureSupabasePorts, parsePublishedPorts } from "../../scripts/supabase-local-ports";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const spawnSync = vi.fn();
  return { ...actual, spawnSync, default: { ...actual, spawnSync } };
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("ensureSupabasePorts", () => {
  const status = {
    API_URL: "http://127.0.0.1:54321",
    STUDIO_URL: "http://127.0.0.1:54323",
    INBUCKET_URL: "http://127.0.0.1:54324",
  };

  it.each([
    ["API", { ...status, API_URL: undefined }],
    ["Studio", { ...status, STUDIO_URL: undefined }],
    ["Inbucket", { ...status, INBUCKET_URL: undefined }],
    ["invalid URL", { ...status, API_URL: "invalid" }],
    ["empty status", {}],
    ["null status", null],
  ])("fails when status has %s missing or invalid", async (_label, value) => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify(value) } as never);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const log = vi.fn();

    expect(await ensureSupabasePorts(log)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Could not determine"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("probes all required endpoints before succeeding", async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify(status) } as never);
    const fetch = vi.fn().mockResolvedValue({ body: null });
    vi.stubGlobal("fetch", fetch);

    expect(await ensureSupabasePorts(vi.fn())).toBe(true);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:54321/auth/v1/health",
      "http://127.0.0.1:54323/",
      "http://127.0.0.1:54324/",
    ]);
  });
});

describe("parsePublishedPorts", () => {
  it("extracts unique host ports from docker's published port list", () => {
    expect(
      parsePublishedPorts(
        "0.0.0.0:54321->8000/tcp, [::]:54321->8000/tcp",
      ),
    ).toEqual([54321]);
  });

  it("handles containers that publish several ports", () => {
    expect(
      parsePublishedPorts("0.0.0.0:54321->8000/tcp, 0.0.0.0:54324->8025/tcp"),
    ).toEqual([54321, 54324]);
  });

  it("ignores exposed ports that are not published to the host", () => {
    expect(parsePublishedPorts("5000/tcp, 8080/tcp")).toEqual([]);
  });
});
