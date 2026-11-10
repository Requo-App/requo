/**
 * scripts/bootstrap-vanilla-db.ts
 *
 * Prepares a plain PostgreSQL database for Requo's committed migration
 * history. The migrations were written against a Supabase-provisioned
 * database, so they expect:
 *
 *   - `anon` and `authenticated` roles for RLS policies.
 *   - the `storage.buckets` table for bucket size/MIME limits.
 *
 * Supabase-hosted databases already have both. Run this once before
 * `npm run db:migrate` on any other Postgres (Neon, RDS, local Docker).
 *
 * This is intentionally idempotent. It does not modify application tables.
 */
import "./load-env";

import postgres from "postgres";

function shouldRequireSsl(databaseUrl: string) {
  try {
    const { hostname, searchParams } = new URL(databaseUrl);

    if (searchParams.get("sslmode") === "disable") {
      return false;
    }

    return !["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return true;
  }
}

function maskUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.password = "****";
    return parsed.toString();
  } catch {
    return "[invalid url]";
  }
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_MIGRATION_URL or DATABASE_URL must be set before bootstrapping.",
    );
  }

  const client = postgres(databaseUrl, {
    ssl: shouldRequireSsl(databaseUrl) ? "require" : false,
    max: 1,
  });

  console.log(`Bootstrapping vanilla Postgres: ${maskUrl(databaseUrl)}`);

  try {
    await client.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          EXECUTE 'CREATE ROLE anon NOLOGIN';
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          EXECUTE 'CREATE ROLE authenticated NOLOGIN';
        END IF;
      END
      $$;

      CREATE SCHEMA IF NOT EXISTS storage;

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id text PRIMARY KEY,
        name text,
        owner uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        public boolean DEFAULT false,
        avif_autodetection boolean DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[],
        owner_id text
      );

      INSERT INTO storage.buckets (id, name)
      VALUES ('inquiry-attachments', 'inquiry-attachments')
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log("✅ Vanilla Postgres bootstrap complete.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("❌ Vanilla Postgres bootstrap failed.");
  console.error(error);
  process.exitCode = 1;
});
