/**
 * scripts/apply-local-realtime-policies.ts
 *
 * Local-dev only: lets the `authenticated` role receive Realtime
 * `postgres_changes` for the notification bell's tables, scoped to the
 * subscriber's own businesses.
 *
 * The Drizzle migrations intentionally keep default-deny RLS everywhere
 * (prod parity), so this runs OUTSIDE migrations, directly against the
 * local database. It REFUSES non-local hosts — prod (Cloud) keeps
 * deny-all and the bell's polling fallback there.
 *
 * Membership is checked through a SECURITY DEFINER helper because
 * `business_members` itself is deny-all; a plain policy subquery would
 * see zero rows. Re-run after `db:reset` / fresh `db:migrate`.
 *
 * Run: npx tsx scripts/apply-local-realtime-policies.ts
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config();

const POLICY = "realtime_authenticated_select_own_business";
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
