-- Minimal Supabase stand-ins for the CI integration database.
--
-- Migrations assume a Supabase-provisioned database:
--   * RLS policies grant/deny to the `anon` and `authenticated` roles.
--   * 0039 caps the `inquiry-attachments` bucket in `storage.buckets`.
--
-- GitHub's postgres service image has neither. Create the roles and the one
-- storage table the migrations touch so `npm run db:migrate` can run against
-- a plain Postgres instance. Application queries connect as the table owner
-- and bypass RLS, matching production.

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
