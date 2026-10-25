import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => ({
  db: (await import("../support/db")).testDb,
}));

import {
  adjustDurableCounter,
  adjustDurableCounters,
  reserveDurableCapacity,
} from "@/lib/ai/capacity-store";
import {
  recordModelTokenUsageDetailed,
  recordModelUsage,
  reserveModelCapacity,
} from "@/lib/ai/capacity-selector";
import { aiCapacityCounters } from "@/lib/db/schema";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
const geminiModel = "google:gemini-3.8-flash";
const directPathModel = `google:${prefix}-direct-path`;

const geminiKeys = {
  rpm: `cap:rpm:${geminiModel}`,
  rpd: `cap:rpd:${geminiModel}`,
  tpm: `cap:tpm:${geminiModel}`,
  tpd: `cap:tpd:${geminiModel}`,
};

function testKey(name: string): string {
  return `${prefix}:${name}`;
}

const trackedKeys = [
  ...Object.values(geminiKeys),
  `cap:rpm:${directPathModel}`,
  `cap:rpd:${directPathModel}`,
  `cap:tpm:${directPathModel}`,
  `cap:tpd:${directPathModel}`,
  testKey("concurrent"),
  testKey("all-or-nothing-a"),
  testKey("all-or-nothing-b"),
  testKey("settle"),
  testKey("expired-window"),
  testKey("newer-window"),
  testKey("batch-a"),
  testKey("batch-b"),
  testKey("batch-rollback-a"),
  testKey("batch-rollback-b"),
];

async function cleanCapacityRows(): Promise<void> {
  await testDb
    .delete(aiCapacityCounters)
    .where(inArray(aiCapacityCounters.key, trackedKeys));
}

async function readValue(key: string): Promise<number | undefined> {
  const [row] = await testDb
    .select()
    .from(aiCapacityCounters)
    .where(inArray(aiCapacityCounters.key, [key]));
  return row?.value;
}

describe("durable AI capacity reservations", () => {
  beforeEach(async () => {
    await cleanCapacityRows();
  });

  afterAll(async () => {
    await cleanCapacityRows();
    await closeTestDb();
  });

  it("awards the last slot to exactly one concurrent reservation", async () => {
    const key = testKey("concurrent");
    const counters = [{ key, limit: 1, amount: 1, ttlSeconds: 60 }];

    const results = await Promise.all(
      Array.from({ length: 8 }, () => reserveDurableCapacity(counters)),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await readValue(key)).toBe(1);
  });

  it("charges no bucket when one bucket in the reservation is full", async () => {
    const fullKey = testKey("all-or-nothing-a");
    const openKey = testKey("all-or-nothing-b");
    await testDb.insert(aiCapacityCounters).values({
      key: fullKey,
      value: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await reserveDurableCapacity([
      { key: openKey, limit: 10, amount: 1, ttlSeconds: 60 },
      { key: fullKey, limit: 5, amount: 1, ttlSeconds: 60 },
    ]);

    expect(result).toMatchObject({ ok: false, key: fullKey });
    expect(await readValue(openKey)).toBeUndefined();
    expect(await readValue(fullKey)).toBe(5);
  });

  it("settles a hold against real usage and starts a fresh expired window", async () => {
    const key = testKey("settle");
    await reserveDurableCapacity([
      { key, limit: 1_000, amount: 1_000, ttlSeconds: 60 },
    ]);

    await adjustDurableCounter(key, -500, 60, 500);
    expect(await readValue(key)).toBe(500);

    const expiredKey = testKey("expired-window");
    await testDb.insert(aiCapacityCounters).values({
      key: expiredKey,
      value: 900,
      expiresAt: new Date(0),
    });
    await adjustDurableCounter(expiredKey, -100, 60, 350);

    expect(await readValue(expiredKey)).toBe(350);
  });

  it("applies every held counter's settlement in one batch", async () => {
    const tokenKey = testKey("batch-a");
    const neuronKey = testKey("batch-b");

    const values = await adjustDurableCounters([
      { key: tokenKey, delta: 3, ttlSeconds: 60, whenMissing: 3 },
      { key: neuronKey, delta: -1, ttlSeconds: 60, whenMissing: 4 },
      { key: tokenKey, delta: -1, ttlSeconds: 60, whenMissing: 0 },
    ]);

    expect(values.get(tokenKey)).toBe(2);
    expect(values.get(neuronKey)).toBe(4);
    expect(await readValue(tokenKey)).toBe(2);
    expect(await readValue(neuronKey)).toBe(4);
  });

  it("rolls back every counter when one settlement cannot be written", async () => {
    const existingKey = testKey("batch-rollback-a");
    const invalidKey = testKey("batch-rollback-b");
    await testDb.insert(aiCapacityCounters).values({
      key: existingKey,
      value: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      adjustDurableCounters([
        { key: existingKey, delta: -2, ttlSeconds: 60, whenMissing: 0 },
        {
          key: invalidKey,
          delta: 1,
          ttlSeconds: 60,
          // Exceeds the integer column, so the insert fails after the first
          // adjustment in the batch has already been applied.
          whenMissing: 2_147_483_648,
        },
      ]),
    ).rejects.toThrow(/Failed query: insert into "ai_capacity_counters"/);

    expect(await readValue(existingKey)).toBe(5);
    expect(await readValue(invalidKey)).toBeUndefined();
  });

  it("does not let a late release erase a newer window's usage", async () => {
    const key = testKey("newer-window");
    await testDb.insert(aiCapacityCounters).values({
      key,
      value: 100,
      expiresAt: new Date(Date.now() + 55_000),
    });

    // The hold belonged to the previous minute window and is settling 90s
    // later. A negative delta must be dropped, not applied to the new window.
    const afterRelease = await adjustDurableCounter(
      key,
      -1_000,
      60,
      0,
      90_000,
    );
    expect(afterRelease).toBe(100);
    expect(await readValue(key)).toBe(100);

    // A late over-spend is still charged in full against real usage.
    const afterOverspend = await adjustDurableCounter(
      key,
      350,
      60,
      350,
      90_000,
    );
    expect(afterOverspend).toBe(450);
  });

  it("records direct provider-path usage in the durable counters", async () => {
    await recordModelUsage(directPathModel);
    await recordModelTokenUsageDetailed(directPathModel, {
      inputTokens: 100,
      outputTokens: 50,
    });

    expect(await readValue(`cap:rpm:${directPathModel}`)).toBe(1);
    expect(await readValue(`cap:rpd:${directPathModel}`)).toBe(1);
    expect(await readValue(`cap:tpm:${directPathModel}`)).toBe(150);
    expect(await readValue(`cap:tpd:${directPathModel}`)).toBe(150);
  });

  it("wires the selector reservation to the durable store", async () => {
    await testDb.insert(aiCapacityCounters).values({
      key: geminiKeys.rpd,
      value: 250,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(reserveModelCapacity(geminiModel, 1_000)).resolves.toBeNull();
    expect(await readValue(geminiKeys.rpm)).toBeUndefined();
    expect(await readValue(geminiKeys.tpm)).toBeUndefined();
  });

  it("settles a selector reservation through the durable counters", async () => {
    const reservation = await reserveModelCapacity(geminiModel, 1_000);
    expect(reservation).not.toBeNull();
    expect(await readValue(geminiKeys.rpm)).toBe(1);
    expect(await readValue(geminiKeys.rpd)).toBe(1);
    expect(await readValue(geminiKeys.tpm)).toBe(1_000);

    await reservation!.settle({ inputTokens: 400, outputTokens: 100 });

    expect(await readValue(geminiKeys.rpm)).toBe(1);
    expect(await readValue(geminiKeys.rpd)).toBe(1);
    expect(await readValue(geminiKeys.tpm)).toBe(500);
  });
});
