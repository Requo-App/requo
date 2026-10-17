#!/usr/bin/env node
// Probes reachability of the Postgres instance referenced by DATABASE_URL.
//
// Exits 0 when DATABASE_URL is set and a TCP connection to the host:port
// succeeds within 10 seconds. Exits non-zero with a stderr message
// containing the string "DATABASE_URL" otherwise.
//
// Used as a pre-flight guard for `npm run test:integration` and the local
// path of `npm run test:e2e:smoke`.

import { createConnection } from "node:net";

import { config } from "dotenv";

// Scripts run outside Next.js, which only auto-loads `.env.local` for the
// app itself. Load `.env.local` first, then `.env` as a fallback, so the
// commands above work from a checkout that only has `.env.local`.
config({ path: ".env.local" });
config();

const TIMEOUT_MS = 10_000;
const SUPPORTED_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

// `--if-local`: skip when PLAYWRIGHT_BASE_URL targets a deployed env
// (local Postgres guard does not apply to preview runs).
if (
  process.argv.includes("--if-local") &&
  process.env.PLAYWRIGHT_BASE_URL?.trim()
) {
  process.exit(0);
}

/**
 * @param {string} message
 */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const raw = process.env.DATABASE_URL;

if (raw === undefined || raw === "") {
  fail(
    "check-db: DATABASE_URL is unset or empty. Set DATABASE_URL to a reachable Postgres instance before running this command.",
  );
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  fail(
    `check-db: DATABASE_URL is not a valid URL. Provide a postgres:// or postgresql:// connection string.`,
  );
}

if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
  fail(
    `check-db: DATABASE_URL uses unsupported protocol "${parsed.protocol}". Expected postgres:// or postgresql://.`,
  );
}

const host = parsed.hostname;
if (!host) {
  fail(`check-db: DATABASE_URL is missing a host component.`);
}

const port = Number(parsed.port) || 5432;

const socket = createConnection({ host, port });
let settled = false;

const timer = setTimeout(() => {
  if (settled) return;
  settled = true;
  socket.destroy();
  fail(
    `check-db: timed out after ${TIMEOUT_MS}ms probing DATABASE_URL host ${host}:${port}. Is Postgres running?`,
  );
}, TIMEOUT_MS);
timer.unref?.();

socket.once("connect", () => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  socket.end();
  process.exit(0);
});

socket.once("error", (err) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  socket.destroy();
  fail(
    `check-db: failed to connect to DATABASE_URL host ${host}:${port} (${err.message}).`,
  );
});
