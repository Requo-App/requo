#!/usr/bin/env node
// Applies scripts/test/ci-postgres-bootstrap.sql to DATABASE_URL.
//
// Used by the integration CI job before `npm run test:integration` so the
// plain Postgres service has the Supabase roles and storage table that the
// migrations reference.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("bootstrap-ci-db: DATABASE_URL is required.");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(
  path.join(here, "ci-postgres-bootstrap.sql"),
  "utf8",
);

const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  console.log("bootstrap-ci-db: CI Postgres roles and storage bucket ready.");
} catch (error) {
  console.error("bootstrap-ci-db: failed to bootstrap the CI database.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
