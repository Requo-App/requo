import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(null),
  generateEmbeddings: vi.fn().mockResolvedValue([]),
  invalidateEmbeddingCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: new Error("not used") }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
  }),
}));

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import {
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/features/knowledge/mutations";
import {
  deleteKnowledgeFileForBusiness,
  knowledgeFileFailureReasons,
  processKnowledgeFile,
} from "@/features/knowledge/processing";
import { listBusinessKnowledgeFiles } from "@/features/knowledge/queries";
import {
  businessKnowledgeChunks,
  businessKnowledgeFiles,
  knowledgeEntries,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

const fileId = `${prefix}_file`;
const chunkId = `${prefix}_chunk`;
const knowledgeEntryId = `${prefix}_entry`;

async function seedKnowledgeEntry() {
  await testDb.insert(knowledgeEntries).values({
    id: knowledgeEntryId,
    businessId: ids.businessId,
    title: "Opening hours",
    content: "We open at nine.",
  });
}

async function seedKnowledgeFile() {
  await testDb.insert(businessKnowledgeFiles).values({
    id: fileId,
    businessId: ids.businessId,
    originalFileName: "faq.txt",
    storagePath: `${ids.businessId}/${fileId}/faq.txt`,
    mimeType: "text/plain",
    byteSize: 32,
    status: "ready",
    extractedCharacterCount: 32,
  });

  await testDb.insert(businessKnowledgeChunks).values({
    id: chunkId,
    businessId: ids.businessId,
    fileId,
    position: 0,
    content: "Uploaded business knowledge.",
    contentHash: `${prefix}_hash`,
    tokenEstimate: 4,
  });
}

/**
 * Makes the next scoped read return `rows` even though the caller's
 * businessId does not own them. This isolates the defense-in-depth write
 * predicate from the pre-read that normally short-circuits the call, so a
 * regression that drops `businessId` from the UPDATE/DELETE is caught.
 */
function mockScopedRead(rows: unknown[]) {
  const query = {
    from: () => query,
    where: () => query,
    limit: async () => rows,
  };

  return vi.spyOn(testDb, "select").mockReturnValueOnce(query as never);
}

/**
 * Knowledge files and entries are customer content that feeds AI retrieval.
 * The background processor and entry mutations must re-check `businessId` in
 * every write so a stale, forged, or mismatched caller cannot touch another
 * business's knowledge.
 */
describe("knowledge tenant isolation", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
    await seedKnowledgeFile();
    await seedKnowledgeEntry();
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("does not list another business's knowledge file", async () => {
    const own = await listBusinessKnowledgeFiles(ids.businessId);
    const foreign = await listBusinessKnowledgeFiles(ids.otherBusinessId);

    expect(own.map((file) => file.id)).toContain(fileId);
    expect(foreign.map((file) => file.id)).not.toContain(fileId);
  });

  it("refuses to process or delete another business's knowledge file", async () => {
    const processed = await processKnowledgeFile({
      businessId: ids.otherBusinessId,
      fileId,
    });

    expect(processed).toEqual({
      ok: false,
      failureReason: knowledgeFileFailureReasons.notFound,
    });

    expect(
      await deleteKnowledgeFileForBusiness({
        businessId: ids.otherBusinessId,
        fileId,
      }),
    ).toBeNull();

    const [storedFile] = await testDb
      .select({ status: businessKnowledgeFiles.status })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.id, fileId))
      .limit(1);
    const storedChunks = await testDb
      .select({ id: businessKnowledgeChunks.id })
      .from(businessKnowledgeChunks)
      .where(eq(businessKnowledgeChunks.fileId, fileId));

    expect(storedFile.status).toBe("ready");
    expect(storedChunks.map((chunk) => chunk.id)).toEqual([chunkId]);

    // The owning business can still delete its own file.
    expect(
      await deleteKnowledgeFileForBusiness({
        businessId: ids.businessId,
        fileId,
      }),
    ).toEqual({ id: fileId });

    const remainingFiles = await testDb
      .select({ id: businessKnowledgeFiles.id })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.id, fileId));
    const remainingChunks = await testDb
      .select({ id: businessKnowledgeChunks.id })
      .from(businessKnowledgeChunks)
      .where(eq(businessKnowledgeChunks.fileId, fileId));

    expect(remainingFiles).toHaveLength(0);
    expect(remainingChunks).toHaveLength(0);
  });

  it("refuses to update or delete another business's knowledge entry", async () => {
    expect(
      await updateKnowledgeEntry({
        businessId: ids.otherBusinessId,
        knowledgeEntryId,
        update: { title: "Hijacked" },
      }),
    ).toBeNull();

    expect(
      await deleteKnowledgeEntry({
        businessId: ids.otherBusinessId,
        knowledgeEntryId,
      }),
    ).toBeNull();

    const [storedEntry] = await testDb
      .select({ title: knowledgeEntries.title })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.id, knowledgeEntryId))
      .limit(1);

    expect(storedEntry?.title).toBe("Opening hours");
  });

  it("re-checks businessId on the knowledge entry update after a stale read", async () => {
    const select = mockScopedRead([
      {
        id: knowledgeEntryId,
        title: "Opening hours",
        content: "We open at nine.",
      },
    ]);

    try {
      await updateKnowledgeEntry({
        businessId: ids.otherBusinessId,
        knowledgeEntryId,
        update: { title: "Hijacked" },
      });
    } finally {
      select.mockRestore();
    }

    const [storedEntry] = await testDb
      .select({ title: knowledgeEntries.title })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.id, knowledgeEntryId))
      .limit(1);

    expect(storedEntry?.title).toBe("Opening hours");
  });

  it("re-checks businessId on the knowledge entry delete after a stale read", async () => {
    const select = mockScopedRead([
      {
        id: knowledgeEntryId,
        title: "Opening hours",
        content: "We open at nine.",
      },
    ]);

    try {
      await deleteKnowledgeEntry({
        businessId: ids.otherBusinessId,
        knowledgeEntryId,
      });
    } finally {
      select.mockRestore();
    }

    const [storedEntry] = await testDb
      .select({ id: knowledgeEntries.id })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.id, knowledgeEntryId))
      .limit(1);

    expect(storedEntry?.id).toBe(knowledgeEntryId);
  });

  it("re-checks businessId when processing a file after a stale read", async () => {
    const select = mockScopedRead([
      {
        id: fileId,
        businessId: ids.otherBusinessId,
        storagePath: `${ids.businessId}/${fileId}/faq.txt`,
        mimeType: "text/plain",
        originalFileName: "faq.txt",
        byteSize: 32,
      },
    ]);

    let result: Awaited<ReturnType<typeof processKnowledgeFile>>;

    try {
      result = await processKnowledgeFile({
        businessId: ids.otherBusinessId,
        fileId,
      });
    } finally {
      select.mockRestore();
    }

    expect(result).toEqual({
      ok: false,
      failureReason: knowledgeFileFailureReasons.unreadable,
    });

    const [storedFile] = await testDb
      .select({ status: businessKnowledgeFiles.status })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.id, fileId))
      .limit(1);

    expect(storedFile?.status).toBe("ready");
  });

  it("re-checks businessId on the knowledge file delete after a stale read", async () => {
    const select = mockScopedRead([
      {
        id: fileId,
        storagePath: `${ids.businessId}/${fileId}/faq.txt`,
      },
    ]);

    try {
      await deleteKnowledgeFileForBusiness({
        businessId: ids.otherBusinessId,
        fileId,
      });
    } finally {
      select.mockRestore();
    }

    const storedFiles = await testDb
      .select({ id: businessKnowledgeFiles.id })
      .from(businessKnowledgeFiles)
      .where(eq(businessKnowledgeFiles.id, fileId));
    const storedChunks = await testDb
      .select({ id: businessKnowledgeChunks.id })
      .from(businessKnowledgeChunks)
      .where(eq(businessKnowledgeChunks.fileId, fileId));

    expect(storedFiles).toHaveLength(1);
    expect(storedChunks).toHaveLength(1);
  });
});
