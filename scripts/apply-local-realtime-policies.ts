/**
 * scripts/apply-local-realtime-policies.ts
 *
 * Local-dev only: makes the dashboard notification bell receive Realtime
 * `postgres_changes` live updates from the local Supabase stack.
 *
 * Two jobs, both configured OUTSIDE the Drizzle migrations (they must never
 * run on hosted prod):
 *
 * 1. Add the bell's tables to the `supabase_realtime` publication so the
 *    Realtime service streams their changes at all.
 * 2. Let the `authenticated` role receive those events for the subscriber's
 *    own businesses. The migrations intentionally keep default-deny RLS
 *    everywhere (prod parity), so Realtime would otherwise deliver nothing.
 *    Membership is checked through a SECURITY DEFINER helper because
 *    `business_members` itself is deny-all; a plain policy subquery would
 *    see zero rows.
 *
 * It REFUSES non-local hosts — hosted prod keeps deny-all and relies on the
 * bell's polling fallback. Re-run after `db:reset` / a fresh `db:migrate`.
 *
 * Run: npm run db:local:setup (or npx tsx scripts/apply-local-realtime-policies.ts)
 */
import "./load-env";

import postgres from "postgres";

const POLICY = "realtime_authenticated_select_own_business";
const PUBLICATION = "supabase_realtime";
const TABLES = [
  "business_notifications",
  "business_notification_states",
  "inquiries",
];

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set.");
  return url;
}

function assertLocalhost(databaseUrl: string): void {
  const { hostname } = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(
      `refusing: ${hostname} is not local. This script never touches hosted databases.`,
    );
  }
}

async function main(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  assertLocalhost(databaseUrl);

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION public.is_business_member(biz_id text)
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      STABLE
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.business_members
          WHERE business_id = biz_id AND user_id = (auth.jwt() ->> 'sub')
        )
      $$`);
    await sql`GRANT EXECUTE ON FUNCTION public.is_business_member(text) TO authenticated`;
    console.log("helper public.is_business_member ready");

    const [publication] = await sql<{ pubname: string }[]>`
      SELECT pubname FROM pg_publication WHERE pubname = ${PUBLICATION}
    `;

    if (!publication) {
      throw new Error(
        `Publication "${PUBLICATION}" not found. Is the local Supabase stack running (npx supabase start)?`,
      );
    }

    const publishedTables = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_publication_tables
      WHERE pubname = ${PUBLICATION} AND schemaname = 'public'
    `;
    const alreadyPublished = new Set(
      publishedTables.map((row) => row.tablename),
    );

    for (const table of TABLES) {
      if (alreadyPublished.has(table)) {
        continue;
      }

      await sql.unsafe(
        `ALTER PUBLICATION ${PUBLICATION} ADD TABLE public."${table}"`,
      );
      console.log("publication added:", table);
    }

    for (const table of TABLES) {
      await sql.unsafe(
        `DROP POLICY IF EXISTS "${POLICY}" ON public."${table}"`,
      );
      await sql.unsafe(
        `CREATE POLICY "${POLICY}" ON public."${table}" ` +
          `FOR SELECT TO authenticated USING (public.is_business_member(business_id))`,
      );
      console.log("policy applied:", table);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
