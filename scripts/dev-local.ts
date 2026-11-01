/**
 * scripts/dev-local.ts
 *
 * Starts the local backing services, then runs the host development servers.
 * The Next.js app and Inngest always run natively so hot reload uses the
 * host filesystem watchers — only Supabase, Redis, and the Upstash-compatible
 * Redis proxy run in Docker.
 *
 * Usage:
 *   npm run dev:local            # services + `npm run dev`
 *   npm run dev:local:tunnel     # services + `npm run dev:tunnel`
 *   npm run services:up          # services only, then exit
 *
 * See docs/setup/local.md.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { ensureSupabasePorts } from "./supabase-local-ports";

const isWindows = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const tunnel = args.has("--tunnel");
const servicesOnly = args.has("--services-only");

function log(message: string): void {
  console.log(`\n[dev:local] ${message}`);
}

function run(
  command: string,
  commandArgs: string[],
  options: { hideStdout?: boolean } = {},
): void {
  const result = spawnSync(command, commandArgs, {
    stdio: ["inherit", options.hideStdout ? "ignore" : "inherit", "inherit"],
    shell: isWindows,
    env: process.env,
  });

  if (result.error) {
    console.error(
      `[dev:local] Could not run ${command}: ${result.error.message}`,
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isDockerAvailable(): boolean {
  const result = spawnSync(
    "docker",
    ["info", "--format", "{{.ServerVersion}}"],
    {
      stdio: "ignore",
      shell: isWindows,
      env: process.env,
    },
  );

  return !result.error && result.status === 0;
}

async function main(): Promise<void> {
  if (!existsSync(".env.local")) {
    console.warn(
      "[dev:local] .env.local is missing. Copy .env.example to .env.local and fill in the values.",
    );
  }

  if (!isDockerAvailable()) {
    console.error(
      "[dev:local] Docker is not running. Start Docker Desktop (or the Docker daemon) and try again.",
    );
    process.exit(1);
  }

  log("Starting Supabase (npx supabase start)...");
  // The CLI prints every local key (service role, storage secret, ...) to
  // stdout. Keep stdout hidden; progress and errors go to stderr. Use
  // `npx supabase status` when the keys are needed.
  run("npx", ["supabase", "start"], { hideStdout: true });

  // Docker Desktop can leave a stale port forward behind when the Supabase
  // CLI restarts its containers. The containers stay healthy but every HTTP
  // request to 127.0.0.1 is reset, which otherwise surfaces as a cryptic
  // "Supabase fetch failed" from the pre-flight health check.
  if (!(await ensureSupabasePorts(log))) {
    console.error(
      "[dev:local] Supabase is running but its local URLs are unreachable. Restart Docker Desktop and try again.",
    );
    process.exit(1);
  }

  log("Starting Redis and the Upstash-compatible proxy...");
  run("docker", ["compose", "up", "-d", "--wait", "redis", "redis-http"]);

  log("Local services are ready:");
  console.log("  Supabase API: http://127.0.0.1:54321");
  console.log(
    "  Postgres:     postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  console.log("  Redis REST:   http://127.0.0.1:8079");
  console.log("  Studio:       http://127.0.0.1:54323");

  if (servicesOnly) {
    console.log(
      "\n[dev:local] Next: `npm run db:local:setup` on a fresh database, then `npm run dev:local`.",
    );
    process.exit(0);
  }

  const devScript = tunnel ? "dev:tunnel" : "dev";
  log(`Starting \`npm run ${devScript}\` on the host...`);

  const child = spawn("npm", ["run", devScript], {
    stdio: "inherit",
    shell: isWindows,
    env: process.env,
  });

  child.on("error", (error) => {
    console.error(
      `[dev:local] Could not start \`npm run ${devScript}\`:`,
      error,
    );
    process.exit(1);
  });

  function stopChild(signal: NodeJS.Signals): void {
    if (child.exitCode !== null || child.signalCode !== null) return;

    try {
      child.kill(signal);
    } catch {
      child.kill();
    }
  }

  process.on("SIGINT", () => stopChild("SIGINT"));
  process.on("SIGTERM", () => stopChild("SIGTERM"));

  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 0 : (code ?? 1);
  });
}

main().catch((error) => {
  console.error("[dev:local] Failed:", error);
  process.exit(1);
});
