/**
 * scripts/supabase-local-ports.ts
 *
 * Detects and repairs stale Docker port publishing for the local Supabase
 * stack.
 *
 * Docker Desktop can keep a stale port forward after the Supabase CLI
 * restarts its containers: TCP connects are accepted, then reset before the
 * request reaches the container. Every HTTP request fails with
 * `UND_ERR_SOCKET` / "other side closed" even though the container itself is
 * healthy. Restarting the affected containers re-registers their ports.
 *
 * See docs/setup/local.md.
 */
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

const PROBE_TIMEOUT_MS = 2_500;
const PROBE_ATTEMPTS = 3;
const PROBE_RETRY_DELAY_MS = 500;
const RECOVERY_TIMEOUT_MS = 60_000;
const RECOVERY_POLL_INTERVAL_MS = 500;

type SupabaseEndpoint = {
  name: string;
  url: string;
};

type SupabaseStatus = {
  API_URL?: string;
  STUDIO_URL?: string;
  INBUCKET_URL?: string;
};

type PublishedContainer = {
  name: string;
  hostPorts: number[];
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readSupabaseEndpoints(): SupabaseEndpoint[] {
  const result = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    shell: isWindows,
    env: process.env,
  });

  if (result.error || result.status !== 0 || !result.stdout) return [];

  let status: SupabaseStatus;
  try {
    status = JSON.parse(result.stdout) as SupabaseStatus;
  } catch {
    return [];
  }

  const candidates: Array<[string, string | undefined, string]> = [
    ["API", status.API_URL, "/auth/v1/health"],
    ["Studio", status.STUDIO_URL, "/"],
    ["Inbucket", status.INBUCKET_URL, "/"],
  ];

  return candidates.flatMap(([name, base, path]) => {
    if (!base) return [];
    try {
      return [{ name, url: new URL(path, base).toString() }];
    } catch {
      return [];
    }
  });
}

async function probeEndpoint(url: string): Promise<boolean> {
  try {
    // Any HTTP response means the published port is working, even a 4xx.
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

async function probeWithRetry(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    if (await probeEndpoint(url)) return true;
    if (attempt < PROBE_ATTEMPTS - 1) await delay(PROBE_RETRY_DELAY_MS);
  }
  return false;
}

export function parsePublishedPorts(portList: string): number[] {
  const ports = [...portList.matchAll(/:(\d+)->/g)].map((match) =>
    Number(match[1]),
  );
  return [...new Set(ports)];
}

function listPublishedContainers(): PublishedContainer[] {
  const result = spawnSync(
    "docker",
    ["ps", "--format", "{{.Names}}\t{{.Ports}}"],
    { encoding: "utf8", shell: isWindows, env: process.env },
  );

  if (result.error || result.status !== 0 || !result.stdout) return [];

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ports = ""] = line.split("\t");
      return { name, hostPorts: parsePublishedPorts(ports) };
    })
    .filter((container) => container.hostPorts.length > 0);
}

function restartContainers(names: string[]): boolean {
  const result = spawnSync("docker", ["restart", ...names], {
    stdio: ["ignore", "ignore", "inherit"],
    shell: isWindows,
    env: process.env,
  });
  return !result.error && result.status === 0;
}

/**
 * Probes the local Supabase HTTP endpoints and restarts the containers behind
 * any stale published ports. Returns false only when recovery was needed and
 * did not succeed.
 */
export async function ensureSupabasePorts(
  log: (message: string) => void,
): Promise<boolean> {
  const endpoints = readSupabaseEndpoints();
  if (endpoints.length === 0) return true;

  const initial = await Promise.all(
    endpoints.map(async (endpoint) => ({
      ...endpoint,
      reachable: await probeWithRetry(endpoint.url),
    })),
  );

  const unreachable = initial.filter((endpoint) => !endpoint.reachable);
  if (unreachable.length === 0) return true;

  const unreachablePorts = new Set(
    unreachable.map((endpoint) => new URL(endpoint.url).port),
  );
  const containers = listPublishedContainers().filter((container) =>
    container.hostPorts.some((port) => unreachablePorts.has(String(port))),
  );

  if (containers.length === 0) {
    log(
      `Supabase is not reachable at ${unreachable.map((endpoint) => endpoint.url).join(", ")}.`,
    );
    return false;
  }

  const names = containers.map((container) => container.name);
  log(
    `Supabase ports are stale (${unreachable.map((endpoint) => endpoint.name).join(", ")}). Restarting ${names.join(", ")}...`,
  );

  if (!restartContainers(names)) {
    log("Could not restart the Supabase containers.");
    return false;
  }

  const deadline = Date.now() + RECOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const recovered = await Promise.all(
      unreachable.map((endpoint) => probeEndpoint(endpoint.url)),
    );
    if (recovered.every(Boolean)) {
      log("Supabase ports recovered.");
      return true;
    }
    await delay(RECOVERY_POLL_INTERVAL_MS);
  }

  log(
    "Supabase ports did not recover. Restart Docker Desktop, then run `npm run dev:local` again.",
  );
  return false;
}
