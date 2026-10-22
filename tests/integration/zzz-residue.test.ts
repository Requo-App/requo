/**
 * Integration residue check.
 *
 * This file must execute after all other integration tests. Filename chosen
 * so Vitest's default alphabetical file ordering places it last.
 *
 * Scope and limitations:
 * - The scan covers the cleanup tables used by the integration fixtures. All
 *   expose a text `id` primary key, so a `LIKE` scan on `id` is well-defined.
 * - Per-file attribution only catches rows whose `id` starts with a known
 *   `Per_File_Prefix`. Fixture-created rows follow this convention; product
 *   code that generates ids through `nanoid()`-style helpers does not, but
 *   those rows are typically cascade-deleted when their owning business or
 *   user is removed by the fixture teardown.
 * - `LIKE '<prefix>%'` is used as a cheap index-friendly pre-filter. The
 *   final decision uses JavaScript `startsWith(prefix + "_")` so that SQL
 *   `LIKE`'s `_` single-character wildcard semantics cannot widen the match.
 *
 * Known prefixes are derived by listing sibling `*.test.ts` files in
 * `tests/integration/` (non-recursive, self excluded) and piping each
 * basename through `derivePerFilePrefix`. That matches the convention used
 * by every integration test in this directory.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  accountSubscriptions,
  activityLogs,
  analyticsEvents,
  auditLogs,
  services,
  businessMembers,
  businessNotifications,
  businesses,
  followUps,
  inquiries,
  quoteItems,
  quotes,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const SELF_BASENAME = "zzz-residue.test.ts";
const INTEGRATION_DIR = path.resolve(__dirname);

// Keep the table order stable for readable failure output.
const CLEANUP_TABLES = [
  { name: "businesses", table: businesses },
  { name: "business_members", table: businessMembers },
  { name: "business_inquiry_forms", table: services },
  { name: "inquiries", table: inquiries },
  { name: "quotes", table: quotes },
  { name: "quote_items", table: quoteItems },
  { name: "follow_ups", table: followUps },
  { name: "activity_logs", table: activityLogs },
  { name: "audit_logs", table: auditLogs },
  { name: "analytics_events", table: analyticsEvents },
  { name: "business_notifications", table: businessNotifications },
  { name: "account_subscriptions", table: accountSubscriptions },
] as const;

function listKnownPrefixes(): string[] {
  const entries = readdirSync(INTEGRATION_DIR, { withFileTypes: true });
  const prefixes = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".test.ts")) continue;
    if (entry.name === SELF_BASENAME) continue;
    prefixes.add(derivePerFilePrefix(entry.name));
  }
  return [...prefixes].sort();
}

type Offender = {
  table: string;
  prefix: string;
  testFile: string;
  ids: string[];
};

function findTestFileForPrefix(prefix: string): string {
  const entries = readdirSync(INTEGRATION_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".test.ts")) continue;
    if (entry.name === SELF_BASENAME) continue;
    if (derivePerFilePrefix(entry.name) === prefix) return entry.name;
  }
  return "<unknown>";
}

describe("integration residue check", () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it(
    "leaves no rows behind for any known test-file prefix",
    async () => {
      const prefixes = listKnownPrefixes();
      expect(prefixes.length).toBeGreaterThan(0);

      const offenders: Offender[] = [];

      for (const { name, table } of CLEANUP_TABLES) {
        for (const prefix of prefixes) {
          // `${prefix}%` is a deliberately loose LIKE pattern so that SQL
          // `_` wildcard semantics cannot cause us to miss rows whose ids
          // contain literal underscores. The JavaScript `startsWith` check
          // below tightens the match back to a literal-prefix comparison.
          const rows = await testDb
            .select({ id: table.id })
            .from(table)
            .where(like(table.id, `${prefix}%`));

          const needle = `${prefix}_`;
          const ids = rows
            .map((row) => row.id)
            .filter(
              (id): id is string =>
                typeof id === "string" && id.startsWith(needle),
            );

          if (ids.length > 0) {
            offenders.push({
              table: name,
              prefix,
              testFile: findTestFileForPrefix(prefix),
              ids,
            });
          }
        }
      }

      if (offenders.length > 0) {
        const lines = offenders
          .map(
            ({ table, prefix, testFile, ids }) =>
              `  - testFile=${testFile} prefix=${prefix} table=${table} ids=[${ids.join(", ")}]`,
          )
          .join("\n");
        throw new Error(
          "Integration residue detected. The following rows were still present after " +
            "the integration run finished, grouped by (offending Test_File, Per_File_Prefix, " +
            "affected table). Each row should have been removed by its owning test's " +
            "fixture teardown.\n" +
            lines,
        );
      }
    },
    60_000,
  );
});
