#!/usr/bin/env tsx
/**
 * Audit: migration history
 *
 * `drizzle/meta/_journal.json` decides the order migrations run in, while the
 * SQL files in `drizzle/` are the committed history. Drift between the two —
 * an unjournaled file, a missing file, a duplicate sequence prefix, or a
 * journal entry out of order — makes the next deploy unpredictable.
 *
 * This audit checks:
 *
 * - every SQL file is journaled and every journal entry has a file;
 * - journal tags and indices are unique and contiguous from zero;
 * - prefixes are four digits and unique, except the historical `0021` pair;
 * - journal order never moves backwards by prefix;
 * - the next generated prefix is reported.
 *
 * Gaps are allowed: journal order, not prefix contiguity, governs execution.
 *
 * Usage: npx tsx scripts/audit-migration-history.ts
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

/**
 * Prefixes that are allowed to repeat because the history was committed that
 * way, mapped to the exact tags that may use them. Additions are reviewed; do
 * not extend this list to make a new collision pass. A later migration can use
 * the next free prefix instead.
 */
const HISTORICAL_DUPLICATE_PREFIXES = new Map<string, readonly string[]>([
  [
    "0021",
    ["0021_invoice_payment_tracking", "0021_invoice_notifications"],
  ],
]);

const SQL_FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export type JournalEntry = {
  idx: number;
  tag: string;
};

export type MigrationHistoryInput = {
  sqlFiles: string[];
  journalEntries: JournalEntry[];
};

export type MigrationHistoryResult = {
  errors: string[];
  migrationCount: number;
  nextPrefix: string | null;
};

function prefixOf(tag: string): string | null {
  const match = /^(\d{4})_/.exec(tag);

  return match?.[1] ?? null;
}

export function auditMigrationHistory({
  sqlFiles,
  journalEntries,
}: MigrationHistoryInput): MigrationHistoryResult {
  const errors: string[] = [];
  const fileTags = new Set<string>();
  const fileTagsByPrefix = new Map<string, string[]>();

  for (const fileName of sqlFiles) {
    const match = SQL_FILE_PATTERN.exec(fileName);

    if (!match) {
      errors.push(
        `migration file "${fileName}" must match NNNN_snake_case.sql`,
      );
      continue;
    }

    const tag = fileName.slice(0, -".sql".length);
    fileTags.add(tag);

    const prefix = match[1];
    const tags = fileTagsByPrefix.get(prefix) ?? [];
    tags.push(tag);
    fileTagsByPrefix.set(prefix, tags);
  }

  for (const [prefix, tags] of fileTagsByPrefix) {
    if (tags.length === 1) continue;

    const allowed = HISTORICAL_DUPLICATE_PREFIXES.get(prefix);

    if (allowed === undefined) {
      errors.push(
        `duplicate migration prefix "${prefix}" (${tags.length} files); use the next free prefix`,
      );
      continue;
    }

    const unexpected = tags.filter((tag) => !allowed.includes(tag));
    const missing = allowed.filter((tag) => !tags.includes(tag));

    if (unexpected.length > 0) {
      errors.push(
        `duplicate migration prefix "${prefix}" may only contain the historical tags ${allowed.join(", ")}; found ${tags.join(", ")}`,
      );
    } else if (missing.length > 0) {
      errors.push(
        `duplicate migration prefix "${prefix}" is missing the historical tag(s) ${missing.join(", ")}`,
      );
    }
  }

  const journalTags = new Set<string>();
  const journalIndices = new Set<number>();

  for (const entry of journalEntries) {
    if (!Number.isInteger(entry.idx) || entry.idx < 0) {
      errors.push(
        `journal entry "${entry.tag}" has an invalid idx (${entry.idx})`,
      );
    } else if (journalIndices.has(entry.idx)) {
      errors.push(`journal idx ${entry.idx} is used more than once`);
    } else {
      journalIndices.add(entry.idx);
    }

    if (!prefixOf(entry.tag)) {
      errors.push(
        `journal entry "${entry.tag}" must start with a four-digit prefix`,
      );
    }

    if (journalTags.has(entry.tag)) {
      errors.push(`journal entry "${entry.tag}" appears more than once`);
    } else {
      journalTags.add(entry.tag);
    }

    if (!fileTags.has(entry.tag)) {
      errors.push(
        `journal entry "${entry.tag}" has no matching drizzle/${entry.tag}.sql`,
      );
    }
  }

  for (const tag of fileTags) {
    if (!journalTags.has(tag)) {
      errors.push(`drizzle/${tag}.sql is not present in the journal`);
    }
  }

  const sortedIndices = [...journalIndices].sort((a, b) => a - b);

  if (sortedIndices.some((idx, position) => idx !== position)) {
    errors.push("journal idx values must be contiguous from 0");
  }

  let previousPrefix = -1;

  for (const entry of journalEntries) {
    const prefix = prefixOf(entry.tag);
    if (!prefix) continue;

    const numericPrefix = Number(prefix);

    if (numericPrefix < previousPrefix) {
      errors.push(
        `journal entry "${entry.tag}" is out of prefix order after "${previousPrefix.toString().padStart(4, "0")}"`,
      );
    }

    previousPrefix = numericPrefix;
  }

  const prefixes = [...fileTagsByPrefix.keys()].map(Number);
  const maxPrefix = prefixes.length > 0 ? Math.max(...prefixes) : null;
  const nextPrefix =
    maxPrefix === null || maxPrefix >= 9999
      ? null
      : String(maxPrefix + 1).padStart(4, "0");

  if (maxPrefix !== null && maxPrefix >= 9999) {
    errors.push("migration prefix space is exhausted (max 9999)");
  }

  if (sqlFiles.length === 0) {
    errors.push("no migration files found under drizzle/");
  }

  return {
    errors,
    migrationCount: sqlFiles.length,
    nextPrefix,
  };
}

function loadInput(): MigrationHistoryInput {
  const journal = JSON.parse(
    fs.readFileSync(JOURNAL_PATH, "utf8"),
  ) as { entries?: JournalEntry[] };

  if (!Array.isArray(journal.entries)) {
    throw new Error(`${JOURNAL_PATH} does not contain an entries array`);
  }

  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return { sqlFiles, journalEntries: journal.entries };
}

function main(): number {
  const result = auditMigrationHistory(loadInput());

  if (result.errors.length > 0) {
    console.error(
      `audit-migration-history: ${result.errors.length} problem(s)`,
    );
    for (const error of result.errors) {
      console.error(`  ${error}`);
    }
    return 1;
  }

  console.log(
    `audit-migration-history: OK (${result.migrationCount} migrations, next prefix ${result.nextPrefix})`,
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exit(main());
}
