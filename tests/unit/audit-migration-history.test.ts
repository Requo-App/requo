import { describe, expect, it } from "vitest";

import {
  auditMigrationHistory,
  type JournalEntry,
} from "../../scripts/audit-migration-history";

function journal(...tags: string[]): JournalEntry[] {
  return tags.map((tag, idx) => ({ idx, tag }));
}

describe("migration history audit", () => {
  it("accepts a complete, ordered journal and reports the next prefix", () => {
    const result = auditMigrationHistory({
      sqlFiles: ["0000_init.sql", "0001_add_quotes.sql"],
      journalEntries: journal("0000_init", "0001_add_quotes"),
    });

    expect(result).toEqual({
      errors: [],
      migrationCount: 2,
      nextPrefix: "0002",
    });
  });

  it("allows the historical duplicate 0021 pair", () => {
    const result = auditMigrationHistory({
      sqlFiles: [
        "0020_before.sql",
        "0021_invoice_payment_tracking.sql",
        "0021_invoice_notifications.sql",
        "0022_after.sql",
      ],
      journalEntries: journal(
        "0020_before",
        "0021_invoice_payment_tracking",
        "0021_invoice_notifications",
        "0022_after",
      ),
    });

    expect(result.errors).toEqual([]);
    expect(result.nextPrefix).toBe("0023");
  });

  it("rejects a new duplicate prefix", () => {
    const result = auditMigrationHistory({
      sqlFiles: ["0000_init.sql", "0001_a.sql", "0001_b.sql"],
      journalEntries: journal("0000_init", "0001_a", "0001_b"),
    });

    expect(result.errors).toContainEqual(
      expect.stringContaining('duplicate migration prefix "0001"'),
    );
  });

  it("rejects a third migration under the historical 0021 prefix", () => {
    const result = auditMigrationHistory({
      sqlFiles: [
        "0021_invoice_payment_tracking.sql",
        "0021_invoice_notifications.sql",
        "0021_third_change.sql",
      ],
      journalEntries: journal(
        "0021_invoice_payment_tracking",
        "0021_invoice_notifications",
        "0021_third_change",
      ),
    });

    expect(result.errors).toContainEqual(
      expect.stringContaining(
        'duplicate migration prefix "0021" may only contain the historical tags',
      ),
    );
  });

  it("rejects replacing a historical 0021 migration with a new tag", () => {
    const result = auditMigrationHistory({
      sqlFiles: [
        "0021_invoice_payment_tracking.sql",
        "0021_replacement.sql",
      ],
      journalEntries: journal(
        "0021_invoice_payment_tracking",
        "0021_replacement",
      ),
    });

    expect(result.errors).toContainEqual(
      expect.stringContaining('found 0021_invoice_payment_tracking, 0021_replacement'),
    );
  });

  it("rejects unjournaled files and journal entries without files", () => {
    const result = auditMigrationHistory({
      sqlFiles: ["0000_init.sql", "0001_extra.sql"],
      journalEntries: journal("0000_init", "0002_missing"),
    });

    expect(result.errors).toContainEqual(
      expect.stringContaining("drizzle/0001_extra.sql is not present"),
    );
    expect(result.errors).toContainEqual(
      expect.stringContaining("journal entry \"0002_missing\" has no matching"),
    );
  });

  it("rejects out-of-order journal entries and non-contiguous idx values", () => {
    const result = auditMigrationHistory({
      sqlFiles: ["0000_init.sql", "0001_add.sql"],
      journalEntries: [
        { idx: 0, tag: "0001_add" },
        { idx: 2, tag: "0000_init" },
      ],
    });

    expect(result.errors).toContainEqual(
      expect.stringContaining("out of prefix order"),
    );
    expect(result.errors).toContain(
      "journal idx values must be contiguous from 0",
    );
  });

  it("rejects malformed migration filenames", () => {
    const result = auditMigrationHistory({
      sqlFiles: ["init.sql"],
      journalEntries: journal("0000_init"),
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("must match NNNN_snake_case.sql"),
        expect.stringContaining("journal entry \"0000_init\" has no matching"),
      ]),
    );
  });
});
