import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), where: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => mocks } }),
}));
vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));

import { cleanupOrphanedInquiryAttachments } from "@/features/inquiries/attachment-cleanup";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.where.mockResolvedValue([]);
  mocks.remove.mockResolvedValue({ error: null });
});

describe("inquiry attachment cleanup pagination", () => {
  it("reaches old uploads on later pages even when earlier folders have no candidates", async () => {
    mocks.list.mockImplementation(async (path: string, options?: { limit: number; offset: number }) => {
      if (path === "uploads") {
        const names = Array.from({ length: 30 }, (_, i) => ({ name: `folder-${i}` }));
        return { data: names.slice(options!.offset, options!.offset + options!.limit), error: null };
      }
      return { data: path === "uploads/folder-29" ? [{ name: "old.pdf", created_at: "2020-01-01" }] : [], error: null };
    });

    const summary = await cleanupOrphanedInquiryAttachments();
    expect(mocks.list).toHaveBeenCalledWith("uploads", { limit: 25, offset: 25, sortBy: { column: "name", order: "asc" } });
    expect(summary.removedPaths).toEqual(["uploads/folder-29/old.pdf"]);
  });

  it("bounds examined folders independently of candidate count", async () => {
    mocks.list.mockImplementation(async (path: string, options?: { limit: number; offset: number }) => ({
      data: path === "uploads"
        ? Array.from({ length: options!.limit }, (_, i) => ({ name: `folder-${options!.offset + i}` }))
        : [],
      error: null,
    }));
    await cleanupOrphanedInquiryAttachments();
    expect(mocks.list.mock.calls.filter(([path]) => path === "uploads")).toHaveLength(2);
    expect(mocks.list.mock.calls.filter(([path]) => path !== "uploads")).toHaveLength(50);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("stops when a page has no folders", async () => {
    mocks.list.mockResolvedValue({ data: [], error: null });
    await cleanupOrphanedInquiryAttachments();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});
