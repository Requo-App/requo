import { config } from "dotenv";
import type { SQL } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

config({ path: ".env.local" });
config();

const connectionString =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

const pool = new Pool({
  connectionString,
});

export const testDb = drizzle(pool, { schema });

/**
 * Mirrors `executeRows` from `@/lib/db/client` so tests exercising raw SQL
 * behave identically to production (node-postgres returns a QueryResult).
 */
export async function testExecuteRows<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  const result = (await testDb.execute<T>(query)) as T[] | { rows: T[] };
  return Array.isArray(result) ? result : result.rows;
}

export async function closeTestDb() {
  await pool.end();
}
