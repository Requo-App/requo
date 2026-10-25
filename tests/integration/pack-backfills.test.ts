import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { derivePerFilePrefix } from "../support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
const schema = `${prefix}_${randomUUID().slice(0, 8)}`;
const databaseUrl = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
// Run the unmodified CLI entry points against isolated copies of the tables.
// Omitting public from search_path prevents a backfill touching shared fixtures.
databaseUrl.searchParams.set("search_path", schema);
const pool = new Pool({
  connectionString: databaseUrl.toString(),
  options: `-csearch_path=${schema}`,
});
const tables = [
  "businesses",
  "business_pack_assignments",
  "business_pack_assignment_history",
  "pack_recipes",
] as const;
const executeFile = promisify(execFile);

function runBackfill(name: "assignments" | "recipes") {
  return executeFile(process.execPath, [
    "--conditions=react-server", "--import", "tsx", `scripts/backfill-pack-${name}.ts`,
  ], {
    env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
    timeout: 15_000,
  });
}

async function seedBusinesses(count: number) {
  await pool.query(`
    INSERT INTO businesses (id, owner_user_id, name, slug, business_type)
    SELECT $1 || i, $1 || 'owner', 'Backfill test', 'pack-backfill-' || i,
      CASE WHEN i % 2 = 0 THEN 'general_project_services' ELSE 'photo_video_production' END
    FROM generate_series(1, $2::integer) AS i
  `, [`${prefix}_`, count]);
}

describe("pack backfill scripts", () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    // LIKE preserves production column types, defaults, checks and indexes.
    // Foreign keys are not copied, so these fixtures need no unrelated users.
    for (const table of tables) {
      await pool.query(`CREATE TABLE "${schema}".${table} (LIKE public.${table} INCLUDING ALL)`);
    }
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE ${tables.join(", ")}`);
  });

  afterAll(async () => {
    try {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await pool.end();
    }
  });

  it("seeds matching assignment/history rows across batches and is idempotent", async () => {
    await seedBusinesses(501);
    await runBackfill("assignments");

    const assignments = await pool.query("SELECT * FROM business_pack_assignments ORDER BY business_id");
    const history = await pool.query("SELECT * FROM business_pack_assignment_history ORDER BY business_id");
    expect(assignments.rows).toHaveLength(501);
    expect(history.rows).toHaveLength(501);
    for (let index = 0; index < assignments.rows.length; index += 1) {
      const assignment = assignments.rows[index];
      const businessNumber = Number(assignment.business_id.slice(`${prefix}_`.length));
      expect(assignment).toMatchObject({
        pack: businessNumber % 2 === 0 ? null : "photo_video",
        pack_version: 1,
        source: "seed",
        updated_at: assignment.created_at,
      });
      expect(history.rows[index]).toMatchObject({
        business_id: assignment.business_id,
        pack: assignment.pack,
        pack_version: assignment.pack_version,
        source: assignment.source,
        actor_user_id: null,
        created_at: assignment.created_at,
      });
    }

    await runBackfill("assignments");
    expect((await pool.query("SELECT * FROM business_pack_assignments ORDER BY business_id")).rows)
      .toEqual(assignments.rows);
    expect((await pool.query("SELECT * FROM business_pack_assignment_history ORDER BY business_id")).rows)
      .toEqual(history.rows);
  });

  it.each(["business_pack_assignments", "business_pack_assignment_history"])(
    "leaves neither insert committed when %s fails",
    async (table) => {
      await seedBusinesses(2);
      await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT reject_backfill CHECK (source <> 'seed')`);
      try {
        await expect(runBackfill("assignments")).rejects.toMatchObject({
          code: 1,
          stderr: expect.stringContaining("reject_backfill"),
        });
        expect((await pool.query("SELECT * FROM business_pack_assignments")).rows).toEqual([]);
        expect((await pool.query("SELECT * FROM business_pack_assignment_history")).rows).toEqual([]);
      } finally {
        await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_backfill`);
      }
    },
  );

  it("finishes recipe batches with null/missing assignments and preserves existing recipes", async () => {
    await seedBusinesses(604);
    // More than one batch of null assignments, followed by 201 packed rows,
    // one packed business with an existing recipe, and 201 unassigned rows.
    await pool.query(`
      INSERT INTO business_pack_assignments (id, business_id, pack, source)
      SELECT $1 || 'assignment_' || i, $1 || i,
        CASE WHEN i <= 201 THEN NULL ELSE 'photo_video'::public.behavior_pack END, 'seed'
      FROM generate_series(1, 403) AS i
    `, [`${prefix}_`]);
    await pool.query(`
      INSERT INTO pack_recipes (id, business_id, pack, kind, version, active, config)
      VALUES ($1 || 'existing', $1 || '403', 'photo_video', 'intake', 2, true, '{"custom":true}')
    `, [`${prefix}_`]);
    const existing = (await pool.query("SELECT * FROM pack_recipes")).rows[0];

    await runBackfill("recipes");

    const recipes = await pool.query("SELECT * FROM pack_recipes ORDER BY id");
    expect(recipes.rows).toHaveLength(201 * 5 + 1);
    expect(recipes.rows.find((row) => row.id === existing.id)).toEqual(existing);
    const seeded = recipes.rows.filter((row) => row.id !== existing.id);
    expect(new Set(seeded.map((row) => row.business_id)).size).toBe(201);
    for (const row of seeded) {
      const businessNumber = Number(row.business_id.slice(`${prefix}_`.length));
      expect(businessNumber).toBeGreaterThan(201);
      expect(businessNumber).toBeLessThan(403);
      expect(row).toMatchObject({ pack: "photo_video", version: 1, active: true });
    }

    await runBackfill("recipes");
    expect((await pool.query("SELECT * FROM pack_recipes ORDER BY id")).rows).toEqual(recipes.rows);
  });
});
